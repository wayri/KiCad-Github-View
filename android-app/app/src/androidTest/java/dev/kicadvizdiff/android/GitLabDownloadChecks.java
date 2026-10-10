package dev.kicadvizdiff.android;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.Principal;
import java.security.cert.Certificate;
import javax.net.ssl.HttpsURLConnection;

/** Offline fake-HTTPS acceptance: no repository, credentials or real network accessed. */
final class GitLabDownloadChecks {
    private static final long SIZE=33L*1024*1024;
    static int run(Context context) throws Exception {
        String commit="a".repeat(40), identity=blobIdentity();
        final boolean[] redirect={false}, corrupt={false}, oversized={false};
        GitLabClient client=new GitLabClient(context,url->{
            String path=url.getPath();
            if(path.endsWith("/raw"))return new FakeConnection(url,null,oversized[0]?DiskProjectStore.FILE_LIMIT+1:SIZE,redirect[0]?302:200);
            String body=path.contains("/repository/commits/")?"{\"id\":\""+commit+"\"}":
                path.endsWith("/repository/tree")?"[{\"type\":\"blob\",\"mode\":\"100644\",\"path\":\"large.kicad_pcb\",\"id\":\""+(corrupt[0]?"b".repeat(40):identity)+"\"}]":
                "{\"path_with_namespace\":\"test/board\",\"default_branch\":\"main\",\"visibility\":\"public\"}";
            return new FakeConnection(url,body.getBytes(StandardCharsets.UTF_8),0,200);
        });
        DiskProjectStore store=new DiskProjectStore(context);client.setDiskProjectStore(store);
        JSONObject request=new JSONObject().put("action","import").put("host","https://gitlab-test.invalid").put("repository","test/board");
        JSONObject consent=client.handle(request,client.generation());
        require(consent.optBoolean("downloadRequired"),"Large GitLab blob did not request download consent");
        request.put("downloadLarge",true).put("temporaryDownload",true);
        JSONObject result=client.handle(request,client.generation()),project=result.getJSONObject("project");
        require(result.getString("provider").equals("gitlab"),"GitLab provider lost");
        require(project.has("gitlab")&&!project.has("github"),"GitLab copy has incorrect origin");
        require(project.getJSONArray("files").getJSONObject(0).getLong("size")==SIZE,"Large unknown-size blob not fully streamed");
        store.remove(project);
        redirect[0]=true;
        try {client.handle(request,client.generation());throw new AssertionError("Redirect was followed");}
        catch(IOException expected){require(expected.getMessage().contains("302"),"Unexpected redirect error");}
        redirect[0]=false;corrupt[0]=true;
        try {client.handle(request,client.generation());throw new AssertionError("Wrong Git blob identity accepted");}
        catch(IOException expected){require(expected.getMessage().contains("identity mismatch"),"Unexpected identity error");}
        corrupt[0]=false;oversized[0]=true;
        try {client.handle(request,client.generation());throw new AssertionError("Oversized raw file accepted");}
        catch(IOException expected){require(expected.getMessage().contains("256 MiB"),"Unexpected file-cap error");}
        int epoch=client.generation();client.cancelRequests();
        try {client.handle(request,epoch);throw new AssertionError("Cancelled transfer accepted");}
        catch(IOException expected){require(expected.getMessage().contains("cancelled"),"Unexpected cancellation error");}
        return 8;
    }
    private static void require(boolean condition,String message){if(!condition)throw new AssertionError(message);}
    private static String blobIdentity()throws Exception {
        MessageDigest digest=MessageDigest.getInstance("SHA-1");digest.update(("blob "+SIZE+"\0").getBytes(StandardCharsets.US_ASCII));
        byte[] buffer=new byte[65536];for(long left=SIZE;left>0;left-=buffer.length)digest.update(buffer,0,(int)Math.min(left,buffer.length));
        StringBuilder out=new StringBuilder();for(byte b:digest.digest())out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();
    }
    private static final class FakeConnection extends HttpsURLConnection {
        final byte[] body;final long length;final int status;
        FakeConnection(URL url,byte[] body,long length,int status){super(url);this.body=body;this.length=body==null?length:body.length;this.status=status;}
        public int getResponseCode(){return status;}
        public long getContentLengthLong(){return length;}
        public InputStream getInputStream(){
            if(getInstanceFollowRedirects())throw new AssertionError("Redirect following enabled");
            if(body!=null)return new ByteArrayInputStream(body);
            return new InputStream(){long left=length;public int read(){if(left==0)return -1;left--;return 0;}
                public int read(byte[] b,int off,int n){if(left==0)return -1;int count=(int)Math.min(left,n);java.util.Arrays.fill(b,off,off+count,(byte)0);left-=count;return count;}};
        }
        public void disconnect(){}public boolean usingProxy(){return false;}public void connect(){}
        public String getCipherSuite(){return "fake";}public Certificate[] getLocalCertificates(){return null;}
        public Certificate[] getServerCertificates(){return new Certificate[0];}public Principal getPeerPrincipal(){return null;}public Principal getLocalPrincipal(){return null;}
    }
}
