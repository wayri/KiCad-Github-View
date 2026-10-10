package dev.kicadvizdiff.android;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceResponse;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** App-private, disk-backed source copies: manifests cross the bridge, file contents do not. */
final class DiskProjectStore {
    static final long FILE_LIMIT=256L*1024*1024, TOTAL_LIMIT=1024L*1024*1024;
    private final File root;
    interface Downloader { void download(String path, File target, long size) throws Exception; }
    DiskProjectStore(Context context) { root=new File(context.getNoBackupFilesDir(),"downloaded-projects"); }
    JSONObject download(String repository,String sha,boolean isPrivate,JSONArray nodes,Downloader downloader) throws Exception {
        JSONArray entries=new JSONArray(); Set<String> paths=new HashSet<>(); long total=0;
        for(int i=0;i<nodes.length();i++) { JSONObject n=nodes.getJSONObject(i); String path=n.optString("path");
            if(!n.optString("type").equals("blob")||!GitHubClient.importable(path)) continue;
            if(!pathOK(path)||!paths.add(path.toLowerCase(Locale.ROOT))||!n.optString("mode").matches("100644|100755")) throw new IOException("Unsafe repository file path");
            long size=n.optLong("size",-1); if(size<0||size>FILE_LIMIT||size>TOTAL_LIMIT-total||entries.length()>=2000) throw new IOException("Downloaded projects support up to 256 MiB per file, 1 GiB total and 2000 files");
            total+=size;entries.put(new JSONObject().put("path",path).put("size",size));
        }
        if(!root.isDirectory()&&!root.mkdirs()) throw new IOException("Cannot create download storage");
        long stored=0;File[] projects=root.listFiles();if(projects!=null)for(File directory:projects){File[] sources=directory.listFiles();if(sources!=null)for(File file:sources)stored+=file.length();}
        if(total>2L*TOTAL_LIMIT-stored)throw new IOException("Downloaded project storage limit reached (2 GiB). Remove an offline copy first.");
        if(total>root.getUsableSpace()-32L*1024*1024) throw new IOException("Not enough phone storage for this project");
        String id=UUID.randomUUID().toString().replace("-","");File staging=new File(root,id);if(!staging.mkdir()) throw new IOException("Cannot start project download");
        JSONArray files=new JSONArray(),assets=new JSONArray();boolean complete=false;
        try {
            for(int i=0;i<entries.length();i++) { JSONObject item=entries.getJSONObject(i);String path=item.getString("path");File target=new File(staging,Integer.toString(i));
                downloader.download(path,target,item.getLong("size"));
                if(target.length()!=item.getLong("size"))throw new IOException("Downloaded file size mismatch");
                try(InputStream input=new FileInputStream(target)) { byte[] prefix=new byte[128];int n=input.read(prefix);if(n>0&&new String(prefix,0,n,StandardCharsets.US_ASCII).startsWith("version https://git-lfs.github.com/spec/")) throw new IOException("Git LFS sources require a local checkout"); }
                item.put("diskPath","/assets/viewer/downloaded/"+id+"/"+i);
                (path.toLowerCase(Locale.ROOT).matches(".*\\.(step|stp|wrl)$")?assets:files).put(item);
            }
            if(files.length()==0) throw new IOException("No KiCad project source files found");
            JSONObject project=new JSONObject().put("id",id).put("diskBacked",true).put("files",files).put("assets",assets).put("name",repository).put("offline",true).put("github",new JSONObject().put("repository",repository).put("sha",sha));
            try(OutputStream output=new FileOutputStream(new File(staging,"manifest.json"))) { output.write(project.toString().getBytes(StandardCharsets.UTF_8)); }
            complete=true;return new JSONObject().put("repository",repository).put("sha",sha).put("private",isPrivate).put("project",project);
        } finally { if(!complete) { File[] children=staging.listFiles();if(children!=null)for(File f:children)f.delete();staging.delete(); } }
    }
    void remove(JSONObject project) throws Exception {
        if(!project.optBoolean("diskBacked"))return;String id=project.getString("id");if(!id.matches("[a-f0-9]{32}"))throw new IOException("Invalid downloaded project ID");
        File directory=new File(root,id);File[] children=directory.listFiles();if(children!=null)for(File file:children){if(file.isFile()&&!file.delete())throw new IOException("Cannot remove downloaded file");}directory.delete();
    }
    WebResourceResponse response(Uri uri) {
        String path=uri.getPath();if(path==null||!path.matches("/assets/viewer/downloaded/[a-f0-9]{32}/[0-9]{1,4}"))return null;
        String[] parts=path.split("/");File dir=new File(root,parts[4]);File file=new File(dir,parts[5]);
        try { if(!new File(dir,"manifest.json").isFile()||!file.isFile())return null;
            // Imported reports are data, including HTML. Never serve them as executable pages.
            Map<String,String> headers=new HashMap<>();
            headers.put("X-Content-Type-Options","nosniff");
            headers.put("Content-Security-Policy","sandbox; default-src 'none'");
            return new WebResourceResponse("text/plain","UTF-8",200,"OK",headers,new FileInputStream(file));
        } catch(IOException error) {return null;}
    }
    static boolean pathOK(String path) {if(path.isEmpty()||path.length()>500||path.startsWith("/")||path.indexOf('\\')>=0||path.indexOf(':')>=0)return false;for(String part:path.split("/",-1))if(part.isEmpty()||part.equals(".")||part.equals(".."))return false;for(int i=0;i<path.length();i++)if(path.charAt(i)<32)return false;return true;}
}
