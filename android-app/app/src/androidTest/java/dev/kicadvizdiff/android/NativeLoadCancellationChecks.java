package dev.kicadvizdiff.android;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import org.json.JSONObject;
import java.io.*;
import java.net.URL;
import java.security.Principal;
import java.security.cert.Certificate;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import javax.net.ssl.HttpsURLConnection;

/** Synthetic read transports only; never accesses user credentials, library or network. */
final class NativeLoadCancellationChecks {
    private static int checks;
    private static void require(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
    private static final class BlockedConnection extends HttpsURLConnection {
        final CountDownLatch reading=new CountDownLatch(1),released=new CountDownLatch(1);
        final AtomicBoolean disconnected=new AtomicBoolean();
        BlockedConnection(URL url){super(url);}
        public int getResponseCode(){return 200;}
        public long getContentLengthLong(){return -1;}
        public InputStream getInputStream(){return new InputStream(){
            public int read() throws IOException {reading.countDown();try{while(!released.await(20,TimeUnit.MILLISECONDS))Thread.interrupted();}catch(InterruptedException ignored){Thread.interrupted();return read();}throw new IOException("Synthetic connection closed");}
            public void close(){released.countDown();}
        };}
        public void disconnect(){disconnected.set(true);released.countDown();}
        public boolean usingProxy(){return false;}public void connect(){}
        public String getCipherSuite(){return "synthetic";}public Certificate[] getLocalCertificates(){return null;}
        public Certificate[] getServerCertificates(){return null;}public Principal getPeerPrincipal(){return null;}public Principal getLocalPrincipal(){return null;}
    }
    static int run(Context base)throws Exception {
        checks=0;
        Context context=new ContextWrapper(base){public Context getApplicationContext(){return this;}public SharedPreferences getSharedPreferences(String name,int mode){return super.getSharedPreferences("load_cancel_selftest_"+name,mode);}};
        for(boolean github:new boolean[]{true,false}) {
            AtomicReference<BlockedConnection> socket=new AtomicReference<>();CountDownLatch opened=new CountDownLatch(1);
            GitHubClient gh=new GitHubClient(context,"load_cancel_selftest",url->{BlockedConnection connection=new BlockedConnection(url);socket.set(connection);opened.countDown();return connection;});
            GitLabClient gl=new GitLabClient(context,url->{BlockedConnection connection=new BlockedConnection(url);socket.set(connection);opened.countDown();return connection;});
            int epoch=github?gh.generation():gl.generation();NativeLoadOperation operation=new NativeLoadOperation();
            AtomicReference<Throwable> error=new AtomicReference<>();AtomicBoolean interruptLeaked=new AtomicBoolean();
            Thread worker=new Thread(()->{try{JSONObject request=new JSONObject().put("action","repository-branches").put("repository","test/repository").put("ref","main");if(github)gh.handleLoad(request,epoch,operation);else gl.handleLoad(request,epoch,operation);error.set(new AssertionError("Stopped read returned data"));}catch(Throwable expected){error.set(expected);}finally{interruptLeaked.set(Thread.currentThread().isInterrupted());}});
            worker.start();require(opened.await(2,TimeUnit.SECONDS),"Read never opened transport");require(socket.get().reading.await(2,TimeUnit.SECONDS),"Read never blocked");
            long start=System.nanoTime();operation.cancel();require(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<200,"Stop blocked caller on I/O");worker.join(2000);
            require(!worker.isAlive()&&error.get() instanceof IOException,"Stop failed to abort blocked provider read");require(socket.get().disconnected.get(),"Stop did not disconnect exact transport");
            require((github?gh.generation():gl.generation())==epoch,"Stop invalidated auth/request generation");require(!interruptLeaked.get(),"Read interrupt leaked into next executor task");
            for(String action:new String[]{"token-connect","sign-out","device-start","oauth-start","publish","review-publish","upload-image"}){
                require(!(github?GitHubClient.cancellableRead(action):GitLabClient.cancellableRead(action)),"Write/auth action advertised Stop");
                try{if(github)gh.handleLoad(new JSONObject().put("action",action),epoch,new NativeLoadOperation());else gl.handleLoad(new JSONObject().put("action",action),epoch,new NativeLoadOperation());throw new AssertionError("Write entered read scope");}catch(IllegalArgumentException expected){checks++;}
            }
            NativeLoadOperation queued=new NativeLoadOperation();queued.cancel();try{if(github)gh.handleLoad(new JSONObject().put("action","repositories"),epoch,queued);else gl.handleLoad(new JSONObject().put("action","repositories"),epoch,queued);throw new AssertionError("Queued stopped read started");}catch(IOException expected){checks++;}
        }
        NativeLoadOperation accepted=new NativeLoadOperation();require(accepted.accept(),"Delivery acceptance failed");accepted.cancel();require(!accepted.cancelled(),"Late Stop rolled back accepted project");require(!accepted.accept(),"Project accepted twice");
        NativeLoadOperation canceled=new NativeLoadOperation();canceled.cancel();require(!canceled.accept(),"Stopped late delivery accepted");
        NativeLoadOperation local=new NativeLoadOperation();CountDownLatch reading=new CountDownLatch(1),closed=new CountDownLatch(1);AtomicReference<Throwable> failure=new AtomicReference<>();
        Thread worker=new Thread(()->{try(NativeLoadOperation.Scope scope=local.enter();InputStream input=NativeLoadOperation.input(new InputStream(){public int read()throws IOException{reading.countDown();for(;;){try{if(closed.await(20,TimeUnit.MILLISECONDS))throw new IOException("Closed");}catch(InterruptedException ignored){}}}public void close(){closed.countDown();}})){input.read();failure.set(new AssertionError("Local source returned after stop"));}catch(Throwable expected){failure.set(expected);}});
        worker.start();require(reading.await(2,TimeUnit.SECONDS),"Local source never read");local.cancel();worker.join(2000);require(!worker.isAlive()&&failure.get() instanceof IOException,"Local blocked stream not closed by Stop");
        NativeLoadOperation refreshing=new NativeLoadOperation();CountDownLatch refreshStarted=new CountDownLatch(1),finishRefresh=new CountDownLatch(1);AtomicBoolean persisted=new AtomicBoolean(),refreshInterrupted=new AtomicBoolean();AtomicReference<Throwable> refreshFailure=new AtomicReference<>();
        Thread refresher=new Thread(()->{try(NativeLoadOperation.Scope scope=refreshing.enter()){
            try(NativeLoadOperation.AuthenticationScope authentication=NativeLoadOperation.preserveAuthentication()){
                refreshStarted.countDown();finishRefresh.await(2,TimeUnit.SECONDS);refreshInterrupted.set(Thread.currentThread().isInterrupted());persisted.set(true);
            }
            NativeLoadOperation.checkCurrent();refreshFailure.set(new AssertionError("Stopped read continued after token rotation"));
        }catch(Throwable expected){refreshFailure.set(expected);}});
        refresher.start();require(refreshStarted.await(2,TimeUnit.SECONDS),"Refresh protection never started");refreshing.cancel();finishRefresh.countDown();refresher.join(2000);
        require(persisted.get()&&!refreshInterrupted.get(),"Stop interrupted credential rotation persistence");require(refreshFailure.get() instanceof IOException,"Stopped read resumed after protected authentication");
        return checks;
    }
}
