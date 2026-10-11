package dev.kicadvizdiff.android;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceResponse;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** App-private disk copies; only manifests cross the bridge. */
final class DiskProjectStore {
    static final long FILE_LIMIT=256L*1024*1024, TOTAL_LIMIT=1024L*1024*1024;
    static final long TEMP_LIFETIME=6L*60*60*1000;
    private static final Object LOCK=new Object();
    private static final Set<String> RETAINING=new HashSet<>();
    private static final java.util.concurrent.locks.ReentrantLock TRANSFER_GUARD=new java.util.concurrent.locks.ReentrantLock();
    private final File root,tempRoot;
    private final Context context;
    interface Downloader { void download(String path, File target, long size) throws Exception; }
    DiskProjectStore(Context context) {
        this.context=context.getApplicationContext();
        root=new File(context.getNoBackupFilesDir(),"downloaded-projects");
        tempRoot=new File(context.getNoBackupFilesDir(),"temporary-projects");
    }
    JSONObject download(String repository,String sha,boolean isPrivate,JSONArray nodes,Downloader downloader) throws Exception {
        return download(repository,sha,isPrivate,nodes,downloader,false);
    }
    JSONObject download(String repository,String sha,boolean isPrivate,JSONArray nodes,Downloader downloader,boolean temporary) throws Exception {
        return download(repository,sha,isPrivate,nodes,downloader,temporary,"");
    }
    JSONObject download(String repository,String sha,boolean isPrivate,JSONArray nodes,Downloader downloader,boolean temporary,String sourceRef) throws Exception {
        JSONObject project=importProject(repository,nodes,downloader,new JSONObject().put("github",new JSONObject().put("repository",repository).put("sha",sha).put("sourceRef",sourceRef)),temporary);
        return new JSONObject().put("repository",repository).put("sha",sha).put("private",isPrivate).put("project",project);
    }
    JSONObject findRemote(String provider,String host,String repository,String ref) {
      synchronized(LOCK) {
        JSONObject newest=null;long newestTime=-1;
        for(File base:new File[]{tempRoot,root}) {
            File[] directories=base.listFiles();if(directories==null)continue;
            for(File directory:directories)try {
                if(!directory.isDirectory()||!directory.getName().matches("[a-f0-9]{32}"))continue;
                JSONObject project=readManifest(directory),origin=project.optJSONObject(provider);
                if(origin==null||project.optBoolean("deletionPending")||expired(project,System.currentTimeMillis()))continue;
                boolean sameRepository=provider.equals("github")?origin.optString("repository").equalsIgnoreCase(repository):origin.optString("repository").equals(repository);
                if(!sameRepository||!origin.optString("host","").equals(host))continue;
                String sha=origin.optString("sha");
                if(!sha.matches("[a-f0-9]{40}")||!(ref.equals(sha)||ref.equals(origin.optString("sourceRef",""))))continue;
                boolean complete=true;
                for(String kind:new String[]{"files","assets"}) {
                    JSONArray entries=project.optJSONArray(kind);if(entries==null){complete=false;break;}
                    for(int i=0;i<entries.length();i++) {
                        JSONObject item=entries.getJSONObject(i);String diskPath=item.optString("diskPath"),expectedPrefix=prefix(base.equals(tempRoot))+directory.getName()+"/";
                        if(!diskPath.startsWith(expectedPrefix)||!diskPath.substring(expectedPrefix.length()).matches("[0-9]{1,4}")){complete=false;break;}
                        File file=new File(directory,diskPath.substring(expectedPrefix.length()));
                        if(!file.isFile()||file.length()!=item.optLong("size",-1)){complete=false;break;}
                    }
                    if(!complete)break;
                }
                if(complete&&directory.lastModified()>newestTime){newest=project;newestTime=directory.lastModified();}
            }catch(Exception ignored){/* Missing or incomplete copies fall back to import. */}
        }
        return newest;
      }
    }
    JSONObject importProject(String name,JSONArray nodes,Downloader downloader,JSONObject metadata,boolean temporary) throws Exception {
      TRANSFER_GUARD.lock();try {
      synchronized(LOCK) {
        cleanupExpired();
        JSONArray entries=new JSONArray();Set<String> paths=new HashSet<>();long known=0;
        for(int i=0;i<nodes.length();i++) {
            JSONObject node=nodes.getJSONObject(i);String path=node.optString("path");
            if(!node.optString("type").equals("blob")||!GitHubClient.importable(path))continue;
            if(!pathOK(path)||!paths.add(path.toLowerCase(Locale.ROOT))||!node.optString("mode").matches("100644|100755"))throw new IOException("Unsafe project file path");
            long size=node.optLong("size",-1);
            if(path.toLowerCase(Locale.ROOT).endsWith(".pdf")&&size>ProjectImporter.MAX_FILE_BYTES)throw new IOException("PDF exceeds 32 MiB");
            if(size < -1 || size>FILE_LIMIT || size>=0&&size>TOTAL_LIMIT-known || entries.length()>=2000)throw new IOException("Downloaded projects support up to 256 MiB per file, 1 GiB total and 2000 files");
            if(size>=0)known+=size;
            entries.put(new JSONObject().put("path",path).put("size",size));
        }
        File base=temporary?tempRoot:root;
        if(!base.isDirectory()&&!base.mkdirs())throw new IOException("Cannot create project storage");
        long stored=storedBytes(root)+storedBytes(tempRoot);
        if(known>2L*TOTAL_LIMIT-stored)throw new IOException("Downloaded project storage limit reached (2 GiB). Remove an offline copy first.");
        if(known>base.getUsableSpace()-32L*1024*1024)throw new IOException("Not enough phone storage for this project");
        String id=UUID.randomUUID().toString().replace("-","");File staging=new File(base,id);
        if(!staging.mkdir())throw new IOException("Cannot start project download");
        File stagingMarker=new File(staging,".staging");
        try(FileOutputStream marker=new FileOutputStream(stagingMarker)){marker.getFD().sync();}catch(IOException error){deleteDirectory(staging);throw error;}
        requestCleanupAt(System.currentTimeMillis()+TEMP_LIFETIME);
        JSONArray files=new JSONArray(),assets=new JSONArray();boolean complete=false;long total=0;
        try {
            for(int i=0;i<entries.length();i++) {
                JSONObject item=entries.getJSONObject(i);String path=item.getString("path");File target=new File(staging,Integer.toString(i));long expected=item.getLong("size");
                downloader.download(path,target,expected);if(!target.isFile())throw new IOException("Downloaded file missing");long actual=target.length();
                if(path.toLowerCase(Locale.ROOT).endsWith(".pdf")&&actual>ProjectImporter.MAX_FILE_BYTES)throw new IOException("PDF exceeds 32 MiB");
                if(actual>FILE_LIMIT||actual>TOTAL_LIMIT-total||actual>2L*TOTAL_LIMIT-stored-total)throw new IOException("Downloaded project exceeds its file, project or storage limit");
                if(expected>=0&&actual!=expected)throw new IOException("Downloaded file size mismatch");
                if(!path.toLowerCase(Locale.ROOT).matches(".*\\.(step|stp|wrl|vrml|glb|pdf)$")) {
                    java.nio.charset.CharsetDecoder decoder=StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT);
                    try(Reader reader=new InputStreamReader(new FileInputStream(target),decoder)){char[] chars=new char[32768];while(reader.read(chars)!=-1){} }
                }
                total+=actual;
                try(InputStream input=new FileInputStream(target)){byte[] prefix=new byte[128];int n=input.read(prefix);if(n>0&&new String(prefix,0,n,StandardCharsets.US_ASCII).startsWith("version https://git-lfs.github.com/spec/"))throw new IOException("Git LFS sources require a local checkout");}
                item.put("size",actual).put("diskPath",prefix(temporary)+id+"/"+i);
                (path.toLowerCase(Locale.ROOT).matches(".*\\.(step|stp|wrl|vrml|glb|pdf)$")?assets:files).put(item);
            }
            if(files.length()==0&&assets.length()==0)throw new IOException("No KiCad project source files found");
            JSONObject project=new JSONObject().put("id",id).put("diskBacked",true).put("files",files).put("assets",assets).put("name",name).put("offline",true);
            for(String key:new String[]{"github","gitlab","remote","local","sourceId","keptFromTemporaryId"})if(metadata!=null&&metadata.has(key))project.put(key,metadata.get(key));
            if(temporary) {
                long created=System.currentTimeMillis();int minutes=new TemporaryProjectSettings(context).durationMinutes();
                project.put("temporary",true).put("createdAt",created).put("durationMinutes",minutes).put("expiresAt",created+minutes*60000L);
            }
            writeManifest(staging,project);complete=true;stagingMarker.delete();
            scheduleCleanup();
            return project;
        } finally {if(!complete)deleteDirectory(staging);}
      }
      }finally{TRANSFER_GUARD.unlock();}
    }
    JSONObject promote(JSONObject source)throws Exception {
      TRANSFER_GUARD.lock();try {
      synchronized(LOCK) {
        if(!source.optBoolean("temporary"))return source;
        String id=validId(source);File from=new File(tempRoot,id);JSONObject original=readManifest(from);
        if(expired(original,System.currentTimeMillis())||original.optBoolean("deletionPending"))throw new IOException("Temporary project has expired. Open its source again.");
        RETAINING.add(id);try {
        JSONArray nodes=new JSONArray();Map<String,File> sources=new HashMap<>();
        for(String kind:new String[]{"files","assets"}){JSONArray entries=original.optJSONArray(kind);if(entries==null)continue;for(int i=0;i<entries.length();i++){JSONObject item=entries.getJSONObject(i);String path=item.getString("path"),diskPath=item.getString("diskPath");String number=diskPath.substring(diskPath.lastIndexOf('/')+1);if(!number.matches("[0-9]{1,4}"))throw new IOException("Invalid temporary source");sources.put(path,new File(from,number));nodes.put(new JSONObject().put("path",path).put("type","blob").put("mode","100644").put("size",item.getLong("size")));}}
        JSONObject metadata=new JSONObject(original.toString()).put("sourceId",original.optString("sourceId",id)).put("keptFromTemporaryId",id);
        return importProject(original.optString("name","KiCad project"),nodes,(path,target,size)->{try(InputStream input=new FileInputStream(sources.get(path));OutputStream output=new FileOutputStream(target)){byte[] buffer=new byte[65536];int n;while((n=input.read(buffer))!=-1){if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("Retention cancelled");output.write(buffer,0,n);}}},metadata,false);
        }finally{RETAINING.remove(id);scheduleCleanup();}
      }
      }finally{TRANSFER_GUARD.unlock();}
    }
    boolean available(JSONObject project) {
        try {JSONObject manifest=readManifest(new File(project.optBoolean("temporary")?tempRoot:root,validId(project)));return !manifest.optBoolean("deletionPending")&&!expired(manifest,System.currentTimeMillis());}catch(Exception error){return false;}
    }
    void remove(JSONObject project)throws Exception {
        if(!project.optBoolean("diskBacked"))return;
        synchronized(LOCK){String id=validId(project);File directory=new File(project.optBoolean("temporary")?tempRoot:root,id);
            TemporaryProjectReminders.cancel(context,id);
            if(!deleteDirectory(directory)) {
                try {JSONObject manifest=readManifest(directory);manifest.put("deletionPending",true);writeManifest(directory,manifest);scheduleCleanup();}catch(Exception ignored){}
                throw new IOException("Unable to remove all downloaded files. Retry removal; background cleanup will also retry.");
            }}
    }
    int clearTemporary() throws Exception {
      synchronized(LOCK) {
        if(!tempRoot.exists())return 0;
        File[] directories=tempRoot.listFiles();if(directories==null)throw new IOException("Cannot inspect temporary downloads. Retry cleanup.");
        int removed=0;boolean failed=false;
        String base=tempRoot.getCanonicalPath()+File.separator;
        for(File directory:directories) {
            if(!directory.isDirectory()||!directory.getName().matches("[a-f0-9]{32}"))continue;
            if(!directory.getCanonicalPath().startsWith(base))throw new IOException("Invalid temporary download location");
            TemporaryProjectReminders.cancel(context,directory.getName());
            try{JSONObject manifest=readManifest(directory);manifest.put("expiresAt",0).put("deletionPending",true);writeManifest(directory,manifest);}catch(Exception ignored){/* Incomplete staging directories are also disposable temporary copies. */}
            if(deleteDirectory(directory))removed++;else failed=true;
        }
        if(failed){scheduleCleanup();throw new IOException("Some temporary files could not be deleted. Retry Clear temporary downloads; automatic cleanup will also retry.");}
        return removed;
      }
    }
    static boolean expired(JSONObject project,long now){return project.optBoolean("temporary")&&(project.optLong("expiresAt",0)<=now);}
    JSONObject temporaryProject(String id)throws Exception {
        synchronized(LOCK){if(id==null||!id.matches("[a-f0-9]{32}"))throw new IOException("Invalid temporary project");
            JSONObject project=readManifest(new File(tempRoot,id));
            if(!id.equals(project.optString("id"))||!project.optBoolean("temporary")||project.optBoolean("deletionPending")||expired(project,System.currentTimeMillis()))throw new IOException("Temporary project has expired");
            return project;}
    }
    void reminderHandled(String id,boolean kept)throws Exception {
        synchronized(LOCK){JSONObject project=temporaryProject(id);project.put("reminderShown",true);if(kept)project.put("keptOffline",true);
            writeManifest(new File(tempRoot,id),project);TemporaryProjectReminders.cancel(context,id);scheduleCleanup();}
    }
    void showDueReminders() {
        synchronized(LOCK){TemporaryProjectSettings settings=new TemporaryProjectSettings(context);if(!settings.remindersEnabled()||!settings.notificationsAllowed())return;
            File[] dirs=tempRoot.listFiles();if(dirs==null)return;long now=System.currentTimeMillis();
            for(File dir:dirs)if(dir.isDirectory()&&dir.getName().matches("[a-f0-9]{32}"))try{JSONObject project=temporaryProject(dir.getName());
                if(!project.optBoolean("reminderShown")&&!project.optBoolean("keptOffline")&&TemporaryProjectSettings.reminderAt(project)<=now){
                    project.put("reminderShown",true);writeManifest(dir,project);TemporaryProjectReminders.show(context,project);}}
                catch(Exception ignored){/* Expired/incomplete projects never receive a Keep action. */}}
    }
    void cleanupExpired() {
      synchronized(LOCK) {
        File[] pendingDirs=root.listFiles();if(pendingDirs!=null)for(File dir:pendingDirs)if(dir.isDirectory()&&dir.getName().matches("[a-f0-9]{32}"))try{if(readManifest(dir).optBoolean("deletionPending"))deleteDirectory(dir);}catch(Exception ignored){if(incompleteStaging(dir)&&new File(dir,".staging").lastModified()+TEMP_LIFETIME<=System.currentTimeMillis())deleteDirectory(dir);}
        File[] projects=tempRoot.listFiles();if(projects==null)return;long now=System.currentTimeMillis();
        for(File dir:projects)if(dir.isDirectory()&&dir.getName().matches("[a-f0-9]{32}")&&!RETAINING.contains(dir.getName())) {
            try {if(expired(readManifest(dir),now)||readManifest(dir).optBoolean("deletionPending")){TemporaryProjectReminders.cancel(context,dir.getName());deleteDirectory(dir);}}
            catch(Exception error){if(dir.lastModified()+TEMP_LIFETIME<=now){TemporaryProjectReminders.cancel(context,dir.getName());deleteDirectory(dir);}}
        }
      }
    }
    void backgroundCleanup() {
        if(!TRANSFER_GUARD.tryLock()){requestCleanupAt(System.currentTimeMillis()+60000);return;}
        try{cleanupExpired();showDueReminders();scheduleCleanup();}finally{TRANSFER_GUARD.unlock();}
    }
    void scheduleCleanup() {
        long next=Long.MAX_VALUE;File[] pendingDirs=root.listFiles();if(pendingDirs!=null)for(File dir:pendingDirs)try{if(readManifest(dir).optBoolean("deletionPending"))next=Math.min(next,System.currentTimeMillis()+60000);}catch(Exception ignored){if(incompleteStaging(dir))next=Math.min(next,new File(dir,".staging").lastModified()+TEMP_LIFETIME);}
        boolean remind=new TemporaryProjectSettings(context).remindersEnabled()&&new TemporaryProjectSettings(context).notificationsAllowed();
        File[] dirs=tempRoot.listFiles();if(dirs!=null)for(File dir:dirs)try{JSONObject project=readManifest(dir);next=Math.min(next,project.optLong("expiresAt",Long.MAX_VALUE));
            if(remind&&!project.optBoolean("reminderShown")&&!project.optBoolean("keptOffline"))next=Math.min(next,TemporaryProjectSettings.reminderAt(project));}catch(Exception ignored){}
        requestCleanupAt(next);
    }
    private void requestCleanupAt(long next) {
        android.app.AlarmManager alarms=(android.app.AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        if(alarms==null)return;
        android.content.Intent intent=new android.content.Intent(context,TemporaryProjectCleanup.class);
        android.app.PendingIntent pending=android.app.PendingIntent.getBroadcast(context,0,intent,android.app.PendingIntent.FLAG_UPDATE_CURRENT|android.app.PendingIntent.FLAG_IMMUTABLE);
        if(next==Long.MAX_VALUE)alarms.cancel(pending);
        else alarms.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP,Math.max(System.currentTimeMillis()+60000,next),pending);
    }
    WebResourceResponse response(Uri uri) {
        String path=uri.getPath();if(path==null||!path.matches("/assets/viewer/(downloaded|temporary-downloads)/[a-f0-9]{32}/[0-9]{1,4}"))return null;
        String[] parts=path.split("/");File dir=new File(parts[3].equals("temporary-downloads")?tempRoot:root,parts[4]);File file=new File(dir,parts[5]);
        try {
            JSONObject manifest=readManifest(dir);if(manifest.optBoolean("deletionPending")||expired(manifest,System.currentTimeMillis())||!file.isFile())return null;
            Map<String,String> headers=new HashMap<>();headers.put("X-Content-Type-Options","nosniff");headers.put("Content-Security-Policy","sandbox; default-src 'none'");headers.put("Cache-Control","no-store");
            return new WebResourceResponse("text/plain","UTF-8",200,"OK",headers,new FileInputStream(file));
        }catch(Exception error){return null;}
    }
    private static String prefix(boolean temporary){return "/assets/viewer/"+(temporary?"temporary-downloads/":"downloaded/");}
    private static String validId(JSONObject project)throws Exception {String id=project.getString("id");if(!id.matches("[a-f0-9]{32}"))throw new IOException("Invalid downloaded project ID");return id;}
    private static JSONObject readManifest(File directory)throws Exception {File file=new File(directory,"manifest.json");try(InputStream input=new android.util.AtomicFile(file).openRead()){return new JSONObject(new String(readManifestBytes(input),StandardCharsets.UTF_8));}}
    private static byte[] readManifestBytes(InputStream input)throws IOException {ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1){if(bytes.size()+n>2*1024*1024)throw new IOException("Manifest too large");bytes.write(buffer,0,n);}return bytes.toByteArray();}
    private static void writeManifest(File directory,JSONObject project)throws Exception {android.util.AtomicFile file=new android.util.AtomicFile(new File(directory,"manifest.json"));FileOutputStream output=null;try{output=file.startWrite();output.write(project.toString().getBytes(StandardCharsets.UTF_8));file.finishWrite(output);}catch(Exception error){if(output!=null)file.failWrite(output);throw error;}}
    private static long storedBytes(File base){long bytes=0;File[] dirs=base.listFiles();if(dirs!=null)for(File dir:dirs){File[] files=dir.listFiles();if(files!=null)for(File file:files)bytes+=file.length();}return bytes;}
    private static boolean incompleteStaging(File dir){return dir.isDirectory()&&dir.getName().matches("[a-f0-9]{32}")&&new File(dir,".staging").isFile()&&!new File(dir,"manifest.json").exists()&&!new File(dir,"manifest.json.bak").exists();}
    private static boolean deleteDirectory(File dir){
        File[] files=dir.listFiles();boolean removed=true;
        if(files!=null)for(File file:files)if(!file.getName().equals("manifest.json")&&!file.getName().equals(".staging")) {if(!file.isFile()||!file.delete())removed=false;}
        // Keep the expiry manifest until every source is gone, so a failed unlink is retried.
        File marker=new File(dir,".staging");if(removed&&marker.exists()&&!marker.delete())removed=false;
        File manifest=new File(dir,"manifest.json");
        if(removed&&manifest.exists()&&!manifest.delete())removed=false;
        return removed&&(!dir.exists()||dir.delete());
    }
    static boolean pathOK(String path){if(path.isEmpty()||path.length()>500||path.startsWith("/")||path.indexOf('\\')>=0||path.indexOf(':')>=0)return false;for(String part:path.split("/",-1))if(part.isEmpty()||part.equals(".")||part.equals(".."))return false;for(int i=0;i<path.length();i++)if(path.charAt(i)<32)return false;return true;}
}
