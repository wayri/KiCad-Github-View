package dev.kicadvizdiff.android;

import android.content.Context;
import android.os.SystemClock;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Isolated disk import acceptance: fake latency, no credentials or network. */
final class DiskImportConcurrencyChecks {
    private static int checks;
    private static JSONArray nodes(int count,long size)throws Exception {
        JSONArray nodes=new JSONArray();for(int i=0;i<count;i++)nodes.put(new JSONObject().put("path","part"+i+".kicad_pcb").put("type","blob").put("mode","100644").put("size",size));return nodes;
    }
    private static JSONObject metadata()throws Exception{return new JSONObject().put("github",new JSONObject().put("repository","test/concurrency").put("sha","a".repeat(40)));}
    private static void require(boolean condition,String message){if(!condition)throw new AssertionError(message);checks++;}
    private static void write(File target,byte[] data)throws Exception{try(OutputStream output=new FileOutputStream(target)){output.write(data);}}
    private static int directories(Context context){File[] dirs=new File(context.getNoBackupFilesDir(),"downloaded-projects").listFiles();return dirs==null?0:dirs.length;}
    private static long timed(DiskProjectStore store,int cap,AtomicInteger peak)throws Exception {
        AtomicInteger active=new AtomicInteger();long start=SystemClock.elapsedRealtime();
        JSONObject result=store.importProject("Latency fixture",nodes(6,4),(path,target,size)->{
            int running=active.incrementAndGet();peak.accumulateAndGet(running,Math::max);
            try{Thread.sleep(120);write(target,"data".getBytes(StandardCharsets.UTF_8));}finally{active.decrementAndGet();}
        },metadata(),false,cap);
        long elapsed=SystemClock.elapsedRealtime()-start;
        require(active.get()==0,"Completed import left an active writer");
        JSONArray files=result.getJSONArray("files");require(files.length()==6,"Parallel import lost files");
        for(int i=0;i<files.length();i++)require(files.getJSONObject(i).getString("path").equals("part"+i+".kicad_pcb")&&files.getJSONObject(i).getString("diskPath").endsWith("/"+i),"Completion order changed manifest identity");
        store.remove(result);return elapsed;
    }
    static int run(Context base)throws Exception {
        File sandbox=new File(base.getNoBackupFilesDir(),"parallel-import-selftest");if(!sandbox.isDirectory()&&!sandbox.mkdirs())throw new IOException("Cannot create isolated import fixture");
        Context context=new android.content.ContextWrapper(base){
            @Override public Context getApplicationContext(){return this;}
            @Override public File getNoBackupFilesDir(){return sandbox;}
            @Override public android.content.SharedPreferences getSharedPreferences(String name,int mode){return super.getSharedPreferences("parallel_import_selftest_"+name,mode);}
            @Override public Object getSystemService(String name){return name.equals(Context.ALARM_SERVICE)||name.equals(Context.NOTIFICATION_SERVICE)?null:super.getSystemService(name);}
        };
        checks=0;DiskProjectStore store=new DiskProjectStore(context);int before=directories(context);
        AtomicInteger serialPeak=new AtomicInteger(),parallelPeak=new AtomicInteger();
        long serial=timed(store,1,serialPeak),parallel=timed(store,3,parallelPeak);
        require(serialPeak.get()==1,"Sequential baseline was not serial");require(parallelPeak.get()==3,"Known-size import did not use three workers");
        require(parallel<serial,"Parallel fake-transport latency did not improve");
        android.util.Log.i("KiViewPerformance","Six 120ms fake transfers: serial="+serial+"ms parallel="+parallel+"ms maxActive="+parallelPeak.get());
        // GitLab currently keeps credential refresh serialized.
        AtomicInteger gitlabPeak=new AtomicInteger(),gitlabActive=new AtomicInteger();
        JSONObject gitlab=store.importProject("GitLab fixture",nodes(3,4),(path,target,size)->{
            int active=gitlabActive.incrementAndGet();gitlabPeak.accumulateAndGet(active,Math::max);
            try{Thread.sleep(10);write(target,"data".getBytes(StandardCharsets.UTF_8));}finally{gitlabActive.decrementAndGet();}
        },new JSONObject().put("gitlab",new JSONObject()),false,3);
        require(gitlabPeak.get()==1,"GitLab credential rotation was parallelized");store.remove(gitlab);
        CountDownLatch started=new CountDownLatch(3);AtomicInteger active=new AtomicInteger();IOException original=new IOException("deliberate transfer failure");
        try {
            store.importProject("Failure fixture",nodes(3,4),(path,target,size)->{
                active.incrementAndGet();try{started.countDown();if(!started.await(3,TimeUnit.SECONDS))throw new IOException("Workers did not start");if(path.equals("part1.kicad_pcb"))throw original;Thread.sleep(10000);write(target,"data".getBytes(StandardCharsets.UTF_8));}finally{active.decrementAndGet();}
            },metadata(),false,3);throw new AssertionError("Failed import committed");
        }catch(IOException expected){require(expected==original,"Parallel failure replaced the original exception");}
        require(active.get()==0,"Failed transaction returned before writers exited");require(directories(context)==before,"Failed import left staging files");
        CountDownLatch cancellationStarted=new CountDownLatch(3);AtomicInteger cancellingActive=new AtomicInteger();AtomicReference<Throwable> cancelledError=new AtomicReference<>();AtomicBoolean interruptRestored=new AtomicBoolean();
        Thread importer=new Thread(()->{try{
            store.importProject("Cancelled fixture",nodes(3,4),(path,target,size)->{cancellingActive.incrementAndGet();try{cancellationStarted.countDown();Thread.sleep(10000);write(target,"data".getBytes(StandardCharsets.UTF_8));}finally{cancellingActive.decrementAndGet();}},metadata(),false,3);
        }catch(Throwable error){cancelledError.set(error);interruptRestored.set(Thread.currentThread().isInterrupted());}},"cancelled-import-selftest");
        importer.start();boolean allStarted=cancellationStarted.await(3,TimeUnit.SECONDS);importer.interrupt();importer.join(5000);
        require(allStarted&&!importer.isAlive(),"Cancellation workers did not finish");require(cancelledError.get() instanceof InterruptedIOException,"Cancellation did not return an interrupt I/O failure");require(interruptRestored.get(),"Caller interrupt flag was lost");require(cancellingActive.get()==0,"Cancelled transaction left an active writer");require(directories(context)==before,"Cancelled import left staging files");
        try{store.importProject("Mismatch",nodes(2,4),(path,target,size)->write(target,"wrong".getBytes(StandardCharsets.UTF_8)),metadata(),false,3);throw new AssertionError("Size mismatch accepted");}catch(IOException expected){require(expected.getMessage().contains("size mismatch"),"Size validation failure changed");}
        try{store.importProject("UTF8",nodes(1,1),(path,target,size)->write(target,new byte[]{(byte)255}),metadata(),false,3);throw new AssertionError("Invalid UTF8 accepted");}catch(java.nio.charset.CharacterCodingException expected){checks++;}
        try{store.importProject("LFS",nodes(1,-1),(path,target,size)->write(target,"version https://git-lfs.github.com/spec/v1".getBytes(StandardCharsets.UTF_8)),metadata(),false,3);throw new AssertionError("LFS pointer accepted");}catch(IOException expected){require(expected.getMessage().contains("Git LFS"),"LFS rejection changed");}
        // Exercise an unknown-size aggregate quota without creating GiB test files.
        File quota=new File(context.getNoBackupFilesDir(),"parallel-quota-selftest");if(!quota.mkdir())throw new IOException("Cannot create quota fixture");
        try {
            java.lang.reflect.Method transfer=DiskProjectStore.class.getDeclaredMethod("downloadEntries",JSONArray.class,DiskProjectStore.Downloader.class,File.class,int.class,boolean.class,long.class);transfer.setAccessible(true);
            AtomicInteger quotaActive=new AtomicInteger(),quotaPeak=new AtomicInteger();
            DiskProjectStore.Downloader download=(path,target,size)->{int running=quotaActive.incrementAndGet();quotaPeak.accumulateAndGet(running,Math::max);try{write(target,"data".getBytes(StandardCharsets.UTF_8));}finally{quotaActive.decrementAndGet();}};
            try{transfer.invoke(null,nodes(3,-1),download,quota,3,false,10L);throw new AssertionError("Aggregate byte quota accepted");}catch(java.lang.reflect.InvocationTargetException wrapped){require(wrapped.getCause() instanceof IOException&&wrapped.getCause().getMessage().contains("storage limit"),"Aggregate byte quota was not preserved");}
            require(quotaPeak.get()==1&&quotaActive.get()==0,"Low-budget unknown transfers were not serialized and joined");
        }finally{File[] files=quota.listFiles();if(files!=null)for(File file:files)if(!file.delete())throw new IOException("Cannot remove quota fixture");if(!quota.delete())throw new IOException("Cannot remove quota directory");}
        require(directories(context)==before,"Validation failure left staging files");return checks;
    }
}
