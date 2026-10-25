package dev.kicadvizdiff.android;

import android.os.SystemClock;
import android.util.Base64;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** The real small-import decoder/scheduler with fake blobs, never live API access. */
final class GitHubImportConcurrencyChecks {
    private static int checks;
    private static void require(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
    private static JSONArray nodes(int count,long size)throws Exception {
        JSONArray nodes=new JSONArray();for(int i=0;i<count;i++)nodes.put(new JSONObject().put("path","part"+i+".kicad_pcb").put("type","blob").put("mode","100644").put("size",size).put("sha",String.format(java.util.Locale.ROOT,"%040x",i+1)));return nodes;
    }
    private static JSONObject blob(byte[] bytes)throws Exception{return new JSONObject().put("encoding","base64").put("content",Base64.encodeToString(bytes,Base64.NO_WRAP));}
    private static long timed(int cap,AtomicInteger peak)throws Exception {
        AtomicInteger active=new AtomicInteger();long start=SystemClock.elapsedRealtime();
        JSONObject result=GitHubClient.importSmallFiles(nodes(6,2),(identity,size)->{
            int running=active.incrementAndGet();peak.accumulateAndGet(running,Math::max);
            try{Thread.sleep(120);int index=Integer.parseInt(identity.substring(32),16)-1;return blob(("v"+index).getBytes(StandardCharsets.UTF_8));}finally{active.decrementAndGet();}
        },()->{},cap);
        long elapsed=SystemClock.elapsedRealtime()-start;JSONArray files=result.getJSONArray("files");require(files.length()==6,"Small import lost files");
        for(int i=0;i<files.length();i++)require(files.getJSONObject(i).getString("path").equals("part"+i+".kicad_pcb")&&files.getJSONObject(i).getString("content").equals("v"+i),"Completion order changed blob identity");
        require(active.get()==0,"Small import returned with active workers");return elapsed;
    }
    static int run()throws Exception {
        checks=0;AtomicInteger serialPeak=new AtomicInteger(),parallelPeak=new AtomicInteger();long serial=timed(1,serialPeak),parallel=timed(3,parallelPeak);
        require(serialPeak.get()==1&&parallelPeak.get()==3,"Small import worker cap changed");require(parallel<serial,"Small-import fake transport latency did not improve");
        android.util.Log.i("KiViewPerformance","Six small 120ms fake blobs: serial="+serial+"ms parallel="+parallel+"ms maxActive="+parallelPeak.get());
        AtomicInteger reads=new AtomicInteger();GitHubClient.BlobLoader noRead=(identity,size)->{reads.incrementAndGet();throw new IOException("Unexpected preflight fetch");};
        JSONArray unsafe=nodes(2,2);unsafe.getJSONObject(1).put("path","../bad.kicad_pcb");
        JSONArray duplicate=nodes(2,2);duplicate.getJSONObject(1).put("path","PART0.kicad_pcb");
        JSONArray symlink=nodes(2,2);symlink.getJSONObject(1).put("mode","120000");
        JSONArray badSha=nodes(2,2);badSha.getJSONObject(1).put("sha","not-a-sha");
        JSONArray missingSize=nodes(2,2);missingSize.getJSONObject(1).put("size",-1);
        for(JSONArray invalid:new JSONArray[]{unsafe,duplicate,symlink,badSha,missingSize,nodes(1,33L*1024*1024),nodes(4,32L*1024*1024),nodes(2001,0)}) {
            try{GitHubClient.importSmallFiles(invalid,noRead,()->{},3);throw new AssertionError("Invalid import preflight accepted");}catch(IOException expected){require(reads.get()==0,"Preflight fetched a blob before checking every file");}
        }
        CountDownLatch started=new CountDownLatch(3);AtomicInteger active=new AtomicInteger();IOException original=new IOException("small blob failure");
        try{GitHubClient.importSmallFiles(nodes(3,2),(identity,size)->{active.incrementAndGet();try{started.countDown();if(!started.await(3,TimeUnit.SECONDS))throw new IOException("Workers did not start");if(identity.endsWith("2"))throw original;Thread.sleep(10000);return blob("ok".getBytes(StandardCharsets.UTF_8));}finally{active.decrementAndGet();}},()->{},3);throw new AssertionError("Failed blob import committed");}catch(IOException expected){require(expected==original,"Blob failure replaced root cause");}
        require(active.get()==0,"Failed blob import left workers alive");
        CountDownLatch cancelledStarted=new CountDownLatch(3);AtomicInteger cancelling=new AtomicInteger();AtomicReference<Throwable> failure=new AtomicReference<>();AtomicBoolean restored=new AtomicBoolean();
        Thread importer=new Thread(()->{try{GitHubClient.importSmallFiles(nodes(3,2),(identity,size)->{cancelling.incrementAndGet();try{cancelledStarted.countDown();Thread.sleep(10000);return blob("ok".getBytes(StandardCharsets.UTF_8));}finally{cancelling.decrementAndGet();}},()->{},3);}catch(Throwable error){failure.set(error);restored.set(Thread.currentThread().isInterrupted());}},"small-import-cancellation-selftest");
        importer.start();boolean ready=cancelledStarted.await(3,TimeUnit.SECONDS);importer.interrupt();importer.join(5000);
        require(ready&&!importer.isAlive()&&failure.get() instanceof InterruptedIOException,"Blob cancellation did not finish");require(restored.get()&&cancelling.get()==0,"Blob cancellation lost interrupt flag or workers");
        AtomicInteger memoryReads=new AtomicInteger();
        try{GitHubClient.importSmallFiles(nodes(2,5L*1024*1024),(identity,size)->{memoryReads.incrementAndGet();Thread.sleep(40);return blob("bad-size".getBytes(StandardCharsets.UTF_8));},()->{},3);throw new AssertionError("Wrong blob size accepted");}catch(IOException expected){require(expected.getMessage().contains("size mismatch")&&memoryReads.get()==1,"In-flight byte budget allowed parallel large buffers");}
        try{GitHubClient.importSmallFiles(nodes(1,1),(identity,size)->blob(new byte[]{(byte)255}),()->{},3);throw new AssertionError("Invalid UTF8 accepted");}catch(java.nio.charset.CharacterCodingException expected){checks++;}
        byte[] lfs="version https://git-lfs.github.com/spec/v1".getBytes(StandardCharsets.UTF_8);
        try{GitHubClient.importSmallFiles(nodes(1,lfs.length),(identity,size)->blob(lfs),()->{},3);throw new AssertionError("LFS pointer accepted");}catch(IOException expected){require(expected.getMessage().contains("Git LFS"),"Small-import LFS rejection changed");}
        JSONArray binary=nodes(1,2);binary.getJSONObject(0).put("path","model.glb");JSONObject result=GitHubClient.importSmallFiles(binary,(identity,size)->blob(new byte[]{0,1}),()->{},3);
        require(result.getJSONArray("files").length()==0&&result.getJSONArray("assets").getJSONObject(0).getString("base64").equals("AAE="),"Binary model encoding changed");
        AtomicBoolean cancelled=new AtomicBoolean();try{GitHubClient.importSmallFiles(nodes(1,2),(identity,size)->{cancelled.set(true);return blob("ok".getBytes(StandardCharsets.UTF_8));},()->{if(cancelled.get())throw new IOException("epoch cancelled");},3);throw new AssertionError("Late cancelled blob returned");}catch(IOException expected){require(expected.getMessage().equals("epoch cancelled"),"Epoch check was not preserved after transfer");}
        return checks;
    }
}
