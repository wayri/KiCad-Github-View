package dev.kicadvizdiff.android;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.util.regex.Pattern;
import java.util.regex.Matcher;
import android.util.Base64;
import java.util.Arrays;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONObject;

/** Shared narrow input/scope contract. Credentials and remote identifiers stay native. */
final class NativeChatRequest {
    final String repository, ref, file, kind, operation, body, outgoingBody, annotationIdentity, messageId, replyTo, expectedUpdatedAt, mutationId;
    final int number;
    NativeChatRequest(JSONObject request) throws Exception {
        for (Iterator<String> keys=request.keys();keys.hasNext();) if(!Arrays.asList("action","host","repository","ref","file","thread","messageAction","body","renderedBody","messageId","replyTo","expectedUpdatedAt","clientMutationId","annotation").contains(keys.next())) throw new IOException("Unsupported chat write field");
        repository=request.getString("repository"); ref=request.getString("ref"); file=request.getString("file"); validateScope(ref,file);
        JSONObject thread=request.getJSONObject("thread");if(thread.length()!=2)throw new IOException("Invalid chat thread");
        kind=thread.getString("kind");Object raw=thread.get("number");number=thread.optInt("number");
        if(!Arrays.asList("issue","discussion").contains(kind)||!(raw instanceof Number)||number<1||thread.getDouble("number")!=number)throw new IOException("Invalid chat thread identity");
        operation=request.getString("messageAction");if(!Arrays.asList("create","reply","edit").contains(operation))throw new IOException("Invalid chat operation");
        body=request.getString("body");if(body.trim().isEmpty()||body.getBytes(StandardCharsets.UTF_8).length>60000||body.indexOf('\0')>=0)throw new IOException("Chat message is empty or exceeds 60000 bytes");
        mutationId=request.getString("clientMutationId");if(!mutationId.matches("[A-Za-z0-9_-]{16,100}"))throw new IOException("Invalid chat mutation identifier");
        for(String field:new String[]{"messageId","replyTo","expectedUpdatedAt"})if(request.has(field)&&!(request.get(field)instanceof String))throw new IOException("Invalid chat identifier or timestamp");
        messageId=request.optString("messageId","");replyTo=request.optString("replyTo","");expectedUpdatedAt=request.optString("expectedUpdatedAt","");
        if(operation.equals("edit")){numericId(messageId);if(!replyTo.isEmpty()||!timestamp(expectedUpdatedAt)||request.has("annotation"))throw new IOException("Editing requires a plain message and its last update timestamp");}
        else if(!messageId.isEmpty()||!expectedUpdatedAt.isEmpty())throw new IOException("Unexpected chat edit fields");
        if(operation.equals("reply"))numericId(replyTo);else if(!replyTo.isEmpty())throw new IOException("Unexpected chat reply target");
        if(request.has("annotation")){JSONObject note=request.getJSONObject("annotation"),anchor=note.getJSONObject("anchor");String provider=anchor.optString("provider","github");
            if(!body.equals(note.optString("text"))||!mutationId.equals(note.optString("id"))||!ref.equals(anchor.optString("ref"))||!file.equals(anchor.optString("file"))||!(provider.equals("github")?repository.equalsIgnoreCase(anchor.optString("repository")):repository.equals(anchor.optString("repository")))||!kind.equals(note.optString("threadType")))throw new IOException("Annotation belongs to another chat scope");
            if(!Arrays.asList("github","gitlab").contains(provider)||provider.equals("gitlab")&&!request.optString("host").equals(anchor.optString("host")))throw new IOException("Annotation provider does not match this chat");
        }
        if(!request.has("annotation")&&request.has("renderedBody"))throw new IOException("Rendered chat text requires a validated annotation");
        outgoingBody=request.has("annotation")?request.getString("renderedBody"):body;annotationIdentity=request.has("annotation")?request.getJSONObject("annotation").toString():"";
        if(outgoingBody.trim().isEmpty()||outgoingBody.getBytes(StandardCharsets.UTF_8).length>65536||outgoingBody.indexOf('\0')>=0)throw new IOException("Rendered chat text exceeds the provider limit");
        if(request.has("annotation")){
            Matcher marker=Pattern.compile("<!-- kicad-review:v1 ([A-Za-z0-9_-]{1,32000}) -->\\s*$").matcher(outgoingBody);
            if(!marker.find()||outgoingBody.indexOf("<!-- kicad-review:")!=marker.start()||outgoingBody.lastIndexOf("<!-- kicad-review:")!=marker.start())throw new IOException("Chat annotation marker is missing or ambiguous");
            byte[] decoded=Base64.decode(marker.group(1),Base64.URL_SAFE|Base64.NO_WRAP);if(decoded.length>24000)throw new IOException("Chat annotation marker is too large");
            String metadataText=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(decoded)).toString();int depth=0;boolean quoted=false,escaped=false;for(int i=0;i<metadataText.length();i++){char c=metadataText.charAt(i);if(quoted){if(escaped)escaped=false;else if(c=='\\')escaped=true;else if(c=='"')quoted=false;}else if(c=='"')quoted=true;else if(c=='{'||c=='['){if(++depth>24)throw new IOException("Chat annotation nesting exceeds its limit");}else if(c=='}'||c==']')depth--;}
            JSONObject metadata=new JSONObject(metadataText);
            JSONObject expected=new JSONObject(annotationIdentity);expected.remove("capture");if(metadata.has("capture")||!sameValue(metadata,expected))throw new IOException("Chat annotation metadata does not match its validated source context");
        }else if(outgoingBody.contains("<!-- kicad-review:"))throw new IOException("Drawing context must use a validated chat annotation");
    }
    private static boolean sameValue(Object first,Object second)throws Exception {
        if(first instanceof JSONObject&&second instanceof JSONObject){JSONObject a=(JSONObject)first,b=(JSONObject)second;if(a.length()!=b.length())return false;for(Iterator<String> keys=a.keys();keys.hasNext();){String key=keys.next();if(!b.has(key)||!sameValue(a.get(key),b.get(key)))return false;}return true;}
        if(first instanceof JSONArray&&second instanceof JSONArray){JSONArray a=(JSONArray)first,b=(JSONArray)second;if(a.length()!=b.length())return false;for(int i=0;i<a.length();i++)if(!sameValue(a.get(i),b.get(i)))return false;return true;}
        if(first instanceof Number&&second instanceof Number)return ((Number)first).doubleValue()==((Number)second).doubleValue();return first==JSONObject.NULL?second==JSONObject.NULL:first.equals(second);
    }
    static void numericId(String value) throws IOException { if(!value.matches("[1-9][0-9]{0,15}"))throw new IOException("Invalid chat message identifier");try{if(Long.parseLong(value)>9007199254740991L)throw new IOException("Invalid chat message identifier");}catch(NumberFormatException invalid){throw new IOException("Invalid chat message identifier");} }
    static long remoteId(JSONObject object,String key)throws Exception {Object raw=object.get(key);if(!(raw instanceof Number))throw new IOException("Invalid remote chat identifier");long value=((Number)raw).longValue();if(value<1||value>9007199254740991L||((Number)raw).doubleValue()!=value)throw new IOException("Invalid remote chat identifier");return value;}
    static String cursor(JSONObject request)throws Exception {if(!request.has("cursor")||request.isNull("cursor"))return "";String value=request.getString("cursor");if(value.isEmpty()||value.length()>1024)throw new IOException("Invalid chat cursor");for(int i=0;i<value.length();i++)if(Character.isISOControl(value.charAt(i)))throw new IOException("Invalid chat cursor");return value;}
    static String summaryTitle(JSONObject object)throws Exception {String value=object.getString("title");int end=Math.min(1024,value.length());if(end<value.length()&&end>0&&Character.isHighSurrogate(value.charAt(end-1)))end--;return value.substring(0,end);}
    static String summaryState(JSONObject object,boolean gitlab)throws Exception {String value=object.getString("state");if(!Arrays.asList(gitlab?"opened":"open","closed").contains(value))throw new IOException("Invalid chat thread state");return value.equals("closed")?"closed":"open";}
    static Object summaryAuthor(JSONObject object,boolean gitlab)throws Exception {String field=gitlab?"author":"user";if(!object.has(field)||object.isNull(field))return JSONObject.NULL;JSONObject author=object.getJSONObject(field);String value=author.getString(gitlab?"username":"login");if(!(gitlab?value.matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,99}"):value.matches("[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?")))throw new IOException("Invalid chat thread author");return value;}
    static boolean timestamp(String value){return value.matches("\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d{1,6})?Z");}
    static void validateScope(String ref,String file)throws IOException {
        if(!ref.matches("[a-fA-F0-9]{40}")||file.length()>500||file.startsWith("/")||file.indexOf('\\')>=0||file.indexOf(':')>=0||file.indexOf('%')>=0||file.indexOf('?')>=0||file.indexOf('#')>=0||!file.matches("(?s).*\\.kicad_(?:sch|pcb|pro|prl)$"))throw new IOException("Chat requires the pinned KiCad drawing scope");
        for(String part:file.split("/",-1))if(part.isEmpty()||part.equals(".")||part.equals(".."))throw new IOException("Unsafe chat drawing path");
        for(int i=0;i<file.length();i++)if(Character.isISOControl(file.charAt(i)))throw new IOException("Unsafe chat drawing path");
    }
    static boolean matchesProject(JSONObject project,String provider,String host,JSONObject request){try{
        String ref=request.getString("ref"),file=request.getString("file");validateScope(ref,file);JSONObject origin=project==null?null:project.optJSONObject(provider);
        if(origin==null)origin=project==null?null:project.optJSONObject("remote");if(origin==null||origin.has("provider")&&!provider.equals(origin.optString("provider")))return false;
        if(!ref.equalsIgnoreCase(origin.optString("sha"))||!(provider.equals("github")?request.getString("repository").equalsIgnoreCase(origin.optString("repository")):request.getString("repository").equals(origin.optString("repository"))))return false;
        if(provider.equals("gitlab")&&!host.equals(origin.optString("host")))return false;
        JSONArray files=project.optJSONArray("files");if(files==null)return false;for(int i=0;i<files.length();i++)if(file.equals(files.getJSONObject(i).optString("path")))return true;
    }catch(Exception ignored){}return false;}
    String fingerprint(String login){StringBuilder value=new StringBuilder();for(String part:new String[]{login,repository,ref,file,kind,String.valueOf(number),operation,body,outgoingBody,annotationIdentity,messageId,replyTo,expectedUpdatedAt})value.append(part.length()).append(':').append(part);return value.toString();}
}
