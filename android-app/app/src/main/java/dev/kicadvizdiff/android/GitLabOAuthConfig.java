package dev.kicadvizdiff.android;

import android.content.Context;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Locale;

/** Public IDs from the signed application's own assets, never project content. */
final class GitLabOAuthConfig {
    private static final int LIMIT=16384;
    private static Map<String,String> configured;
    private GitLabOAuthConfig() {}

    static synchronized String resolve(Context context,String host) {
        if(!validOrigin(host))return "";
        if(configured==null) {
            try(InputStream input=context.getAssets().open("viewer/provider-oauth.json")) {
                ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[1024];int count;
                while((count=input.read(buffer))!=-1) {if(bytes.size()+count>LIMIT)throw new IllegalArgumentException("OAuth configuration exceeds limit");bytes.write(buffer,0,count);}
                String text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
                configured=parse(text);
            } catch(Exception unavailable) {configured=Collections.emptyMap();}
        }
        String value=configured.get(host);return value==null?"":value;
    }

    static Map<String,String> parse(String text)throws Exception {
        if(text==null||text.getBytes(StandardCharsets.UTF_8).length>LIMIT)throw new IllegalArgumentException("Invalid OAuth configuration");
        JSONObject document=new JSONObject(text);
        if(document.length()!=2||!(document.opt("version") instanceof Integer)||document.getInt("version")!=1||!document.has("gitlab"))throw new IllegalArgumentException("Invalid OAuth configuration");
        JSONObject hosts=document.getJSONObject("gitlab");if(hosts.length()>32)throw new IllegalArgumentException("Invalid OAuth configuration");
        Map<String,String> result=new HashMap<>();Iterator<String> names=hosts.keys();
        while(names.hasNext()) {
            String host=names.next();JSONObject entry=hosts.getJSONObject(host);
            if(!validOrigin(host)||entry.length()!=1||!(entry.opt("clientId") instanceof String))throw new IllegalArgumentException("Public OAuth client IDs only");
            String id=entry.getString("clientId");if(!id.matches("[A-Za-z0-9_-]{10,200}"))throw new IllegalArgumentException("Invalid public OAuth client ID");result.put(host,id);
        }
        return Collections.unmodifiableMap(result);
    }

    static String requestClientId(JSONObject request) { return request.optString("clientId", ""); }

    private static boolean validOrigin(String host) {
        try {
            if(host==null||host.length()>300)return false;URI uri=new URI(host);
            return "https".equals(uri.getScheme())&&uri.getHost()!=null&&!uri.getHost().endsWith(".")&&uri.getRawUserInfo()==null&&uri.getRawQuery()==null&&uri.getRawFragment()==null&&"".equals(uri.getRawPath())&&uri.getPort()!=443&&uri.getPort()!=0&&uri.getPort()<=65535&&host.equals("https://"+uri.getRawAuthority().toLowerCase(Locale.ROOT));
        }catch(Exception invalid){return false;}
    }
}
