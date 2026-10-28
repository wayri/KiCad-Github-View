package dev.kicadvizdiff.android;
import java.io.IOException;
import org.json.JSONObject;

/** Synthetic provider fixtures only. These checks never create remote repositories. */
final class RevisionForkChecks {
    static final String SHA="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    static int checks;
    static void require(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
    static JSONObject input()throws Exception{return new JSONObject().put("repository","owner/board").put("ref",SHA).put("file","board.kicad_pcb").put("sha",SHA).put("name","new-board").put("confirmed",true);}
    static final class Fixture implements NativeRevisionFork.Transport {
        final boolean gh;boolean created,exists,failBranch,cancel;int writes,polls;
        Fixture(boolean gh){this.gh=gh;}
        public void authorize()throws Exception {if(cancel)throw new IOException("Cancelled");}
        public void pause(){}
        public JSONObject get(String path,boolean missing)throws Exception {
            if(path.equals("/user"))return new JSONObject().put("id",1).put(gh?"login":"username","reader");
            if(path.equals(gh?"/repos/owner/board":"/projects/owner%2Fboard"))return new JSONObject().put("id",10).put(gh?"full_name":"path_with_namespace","owner/board");
            if(path.equals(gh?"/repos/reader/new-board":"/projects/reader%2Fnew-board")&&!created)return exists?new JSONObject().put("id",20):null;
            if(path.equals(gh?"/repos/reader/new-board":"/projects/20")){polls++;return new JSONObject().put("id",20).put(gh?"full_name":"path_with_namespace","reader/new-board").put("default_branch","main").put("import_status",polls>1?"finished":"started");}
            if(path.equals(gh?"/repos/owner/board/commits/"+SHA:"/projects/10/repository/commits/"+SHA)||path.equals(gh?"/repos/reader/new-board/commits/"+SHA:"/projects/20/repository/commits/"+SHA))return new JSONObject().put(gh?"sha":"id",SHA);
            if(path.equals(gh?"/repos/reader/new-board/git/ref/heads/review%2Faaaaaaaaaaaa":"/projects/20/repository/branches/review%2Faaaaaaaaaaaa"))return null;
            throw new AssertionError("Unexpected GET "+path);
        }
        public JSONObject post(String path,JSONObject body,int expected)throws Exception {
            writes++;
            if(path.equals(gh?"/repos/owner/board/forks":"/projects/10/fork")){require(expected==(gh?202:201),"fork status");created=true;return new JSONObject().put("id",20).put("fork",true).put(gh?"full_name":"path_with_namespace","reader/new-board").put(gh?"parent":"forked_from_project",new JSONObject().put("id",10));}
            require(path.equals(gh?"/repos/reader/new-board/git/refs":"/projects/20/repository/branches"),"write escaped new fork");require(expected==201,"branch status");require(body.getString(gh?"sha":"ref").equals(SHA),"branch SHA changed");
            if(failBranch)throw new IOException("Network failure");return new JSONObject().put(gh?"ref":"name",gh?"refs/heads/review/aaaaaaaaaaaa":"review/aaaaaaaaaaaa").put(gh?"object":"commit",new JSONObject().put(gh?"sha":"id",SHA));
        }
    }
    static int run()throws Exception {
        checks=0;
        for(boolean gh:new boolean[]{true,false}){
            Fixture good=new Fixture(gh);JSONObject value=NativeRevisionFork.create(input(),gh,gh?"https://github.com":"https://gitlab.com",good);require(value.getBoolean("created")&&!value.getBoolean("partial"),"fork did not complete");require(good.writes==2,"unexpected writes");if(!gh)require(good.polls==2,"GitLab import was not polled");
            Fixture existing=new Fixture(gh);existing.exists=true;try{NativeRevisionFork.create(input(),gh,"https://gitlab.com",existing);throw new AssertionError("Existing repository reused");}catch(IOException expected){require(existing.writes==0,"existing repository changed");}
            Fixture partial=new Fixture(gh);partial.failBranch=true;value=NativeRevisionFork.create(input(),gh,gh?"https://github.com":"https://gitlab.com",partial);require(value.getBoolean("created")&&value.getBoolean("partial")&&!value.getBoolean("uncertain"),"partial fork lost");require(value.getString("url").endsWith("/reader/new-board"),"recovery link lost");
            Fixture denied=new Fixture(gh);denied.cancel=true;try{NativeRevisionFork.create(input(),gh,"https://gitlab.com",denied);throw new AssertionError("Policy denied request succeeded");}catch(IOException expected){require(denied.writes==0,"policy denial wrote remotely");}
            for(JSONObject invalid:new JSONObject[]{input().put("confirmed",false),input().put("sha","main"),input().put("branch","../main"),input().put("file","../secret")}){Fixture api=new Fixture(gh);try{NativeRevisionFork.create(invalid,gh,"https://gitlab.com",api);throw new AssertionError("Invalid request accepted");}catch(IOException expected){require(api.writes==0,"invalid request wrote remotely");}}
        }
        return checks;
    }
}
