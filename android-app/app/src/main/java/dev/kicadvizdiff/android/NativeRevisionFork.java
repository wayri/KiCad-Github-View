package dev.kicadvizdiff.android;

import java.io.IOException;
import java.net.URLEncoder;
import java.util.Locale;
import org.json.JSONObject;

/** Native provider workflow; tokens never enter viewer JavaScript. No existing ref is updated. */
final class NativeRevisionFork {
    private static final java.util.Set<String> ACTIVE=java.util.concurrent.ConcurrentHashMap.newKeySet();
    interface Transport {
        JSONObject get(String path, boolean missingAllowed) throws Exception;
        JSONObject post(String path, JSONObject body, int expectedStatus) throws Exception;
        void authorize() throws Exception;
        default void pause() throws Exception { Thread.sleep(1000); }
    }
    private static IOException fail(String text) { return new IOException(text); }
    private static long id(JSONObject object)throws Exception {Object raw=object.get("id");if(!(raw instanceof Number))throw fail("Invalid provider object identity");long value=((Number)raw).longValue();if(value<1||value>9007199254740991L||((Number)raw).doubleValue()!=value)throw fail("Invalid provider object identity");return value;}
    private static String enc(String value) throws Exception { return URLEncoder.encode(value,"UTF-8").replace("+","%20"); }
    private static boolean slug(String value) { return value.matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,99}"); }
    private static boolean path(String value) { if(value.isEmpty()||value.length()>500||value.matches("(?s).*[\\\\:\\x00-\\x1f\\x7f].*"))return false;for(String p:value.split("/",-1))if(p.isEmpty()||p.equals(".")||p.equals(".."))return false;return true; }
    private static boolean ref(String value) { if(!path(value)||value.matches("(?s).*[ ~^?*\\[].*")||value.contains("..")||value.contains("@{")||value.endsWith("."))return false;for(String p:value.split("/"))if(p.startsWith(".")||p.endsWith(".lock"))return false;return true; }
    static void validate(JSONObject value,boolean github)throws Exception {
        if(!Boolean.TRUE.equals(value.opt("confirmed")))throw fail("Confirm creation of a new remote fork first");
        String repo=value.getString("repository"),sha=value.getString("sha");String[] parts=repo.split("/",-1);
        if(repo.length()>300||parts.length<2||github&&parts.length!=2)throw fail("Invalid source repository");for(String p:parts)if(!slug(p))throw fail("Invalid source repository");
        if(!sha.matches("[a-fA-F0-9]{40}")||!ref(value.getString("ref"))||!path(value.getString("file")))throw fail("Invalid selected commit or source drawing scope");
        String name=value.optString("name",parts[parts.length-1]+"-review-"+sha.substring(0,12)),branch=value.optString("branch","review/"+sha.substring(0,12));
        if(!slug(name)||!ref(branch)||branch.length()>200)throw fail("Invalid fork name or branch");
        String namespace=value.optString("destinationNamespace","");
        if(!namespace.isEmpty()&&!(github?namespace.matches("[A-Za-z0-9][A-Za-z0-9-]{0,38}"):namespace.matches("[1-9][0-9]{0,14}")))throw fail("Invalid destination namespace; GitLab requires a numeric namespace ID");
    }
    static JSONObject create(JSONObject value,boolean gh,String host,Transport transport)throws Exception {
        validate(value,gh);
        String key=(gh?"github":"gitlab")+"|"+host+"|"+value.getString("repository")+"|"+value.optString("destinationNamespace","")+"|"+value.optString("name","");
        if(!ACTIVE.add(key))throw fail("A fork operation is already active; wait for its result");
        try{return run(value,gh,host,transport);}finally{ACTIVE.remove(key);}
    }
    private static JSONObject run(JSONObject value,boolean gh,String host,Transport transport)throws Exception {
        validate(value,gh);transport.authorize();
        String repo=value.getString("repository"),sha=value.getString("sha").toLowerCase(Locale.ROOT),name=value.optString("name",repo.substring(repo.lastIndexOf('/')+1)+"-review-"+sha.substring(0,12)),branch=value.optString("branch","review/"+sha.substring(0,12));
        String ns=value.optString("destinationNamespace",""),source=gh?"/repos/"+repo:"/projects/"+enc(repo);
        JSONObject user=get(transport,"/user",false);long userId=id(user);String username=user.optString(gh?"login":"username","");
        if(userId<1||!username.matches(gh?"[A-Za-z0-9][A-Za-z0-9-]{0,38}":"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}"))throw fail("Provider account could not be verified");
        String namespace=username;long namespaceId=0;
        if(!ns.isEmpty()){
            if(gh){namespace=ns;if(!ns.equalsIgnoreCase(username)){JSONObject member=get(transport,"/user/memberships/orgs/"+ns,false);if(!"active".equals(member.optString("state"))||member.optJSONObject("organization")==null||!ns.equalsIgnoreCase(member.getJSONObject("organization").optString("login")))throw fail("Active destination organization membership is required");}}
            else {namespaceId=Long.parseLong(ns);JSONObject record=get(transport,"/namespaces/"+namespaceId,false);namespace=record.optString("full_path","");String kind=record.optString("kind");if(id(record)!=namespaceId||!(kind.equals("user")||kind.equals("group"))||namespace.isEmpty())throw fail("Invalid GitLab namespace identity");for(String part:namespace.split("/",-1))if(!slug(part))throw fail("Invalid GitLab namespace path");if(kind.equals("user")&&!namespace.equals(username))throw fail("Select your namespace or an authorized group");}
        }
        String target=namespace+"/"+name,targetPath=gh?"/repos/"+target:"/projects/"+enc(target);
        if(target.equalsIgnoreCase(repo))throw fail("Fork destination must differ from source");
        JSONObject metadata=get(transport,source,false);long sourceId=id(metadata);
        if(sourceId<1||!(gh?repo.equalsIgnoreCase(metadata.optString("full_name")):repo.equals(metadata.optString("path_with_namespace")))||metadata.has("allow_forking")&&!metadata.optBoolean("allow_forking")||"disabled".equals(metadata.optString("forking_access_level")))throw fail("Source identity or fork permission could not be verified");
        if(!gh)source="/projects/"+sourceId;
        JSONObject selected=get(transport,source+(gh?"/commits/":"/repository/commits/")+sha,false);if(!sha.equalsIgnoreCase(selected.optString(gh?"sha":"id")))throw fail("Selected commit is unavailable in the source repository");
        if(get(transport,targetPath,true)!=null)throw fail("Destination already exists; choose a new fork name");
        JSONObject result=new JSONObject().put("provider",gh?"github":"gitlab").put("host",host).put("repository",target).put("branch",branch).put("sha",sha).put("url",host+"/"+target).put("created",false);boolean created=false;
        try {
            JSONObject body=new JSONObject().put("name",name);if(gh){body.put("default_branch_only",false);if(!namespace.equalsIgnoreCase(username))body.put("organization",namespace);}else{body.put("path",name);if(namespaceId>0)body.put("namespace_id",namespaceId);}
            transport.authorize();JSONObject fork=transport.post(source+(gh?"/forks":"/fork"),body,gh?202:201);long id=id(fork);JSONObject parent=fork.optJSONObject(gh?"parent":"forked_from_project");
            if(id<1||id==sourceId||parent==null||id(parent)!=sourceId||gh&&(!fork.optBoolean("fork")||!target.equalsIgnoreCase(fork.optString("full_name")))||!gh&&!target.equals(fork.optString("path_with_namespace")))throw fail("Provider did not confirm a new fork at the requested destination");
            created=true;result.put("created",true);if(!gh)targetPath="/projects/"+id;boolean ready=false;
            for(int attempt=0;attempt<10;attempt++){
                if(attempt>0)transport.pause();JSONObject current=get(transport,targetPath,true);if(current==null)continue;
                if(id(current)!=id||!(gh?target.equalsIgnoreCase(current.optString("full_name")):target.equals(current.optString("path_with_namespace"))))throw fail("Fork identity changed during preparation");
                if(branch.equals(current.optString("default_branch")))throw fail("Review branch must differ from the default branch");
                if(!gh){String state=current.optString("import_status");if(state.equals("failed"))throw fail("GitLab fork import failed");if(!state.equals("finished"))continue;}
                JSONObject copied=get(transport,targetPath+(gh?"/commits/":"/repository/commits/")+sha,true);if(copied!=null&&sha.equalsIgnoreCase(copied.optString(gh?"sha":"id"))){ready=true;break;}
            }
            if(!ready)throw fail("Fork is still being prepared; inspect it before creating the review branch");
            if(get(transport,targetPath+(gh?"/git/ref/heads/":"/repository/branches/")+enc(branch),true)!=null)throw fail("Review branch already exists and was not changed");
            transport.authorize();JSONObject made=transport.post(targetPath+(gh?"/git/refs":"/repository/branches"),gh?new JSONObject().put("ref","refs/heads/"+branch).put("sha",sha):new JSONObject().put("branch",branch).put("ref",sha),201);
            JSONObject commit=made.optJSONObject(gh?"object":"commit");if(!(gh?("refs/heads/"+branch).equals(made.optString("ref")):branch.equals(made.optString("name")))||commit==null||!sha.equalsIgnoreCase(commit.optString(gh?"sha":"id")))throw fail("Selected-commit branch was not confirmed");
            return result.put("partial",false).put("url",host+"/"+target+(gh?"/tree/":"/-/tree/")+enc(branch));
        }catch(Exception error){return result.put("partial",true).put("uncertain",!created).put("message",created?"Fork created, but its selected-commit branch was not confirmed. Inspect the fork before further action.":"Fork creation was not confirmed. Inspect the destination before retrying.");}
    }
    private static JSONObject get(Transport transport,String path,boolean missing)throws Exception { transport.authorize();return transport.get(path,missing); }
}
