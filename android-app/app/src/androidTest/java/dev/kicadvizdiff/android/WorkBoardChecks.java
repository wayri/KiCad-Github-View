package dev.kicadvizdiff.android;

import java.io.IOException;
import org.json.JSONArray;
import org.json.JSONObject;

/** Deterministic provider board fixtures. Never connects to a live account. */
final class WorkBoardChecks {
    static int checks;
    static final String REPO="owner/board",HOST="https://gitlab-board-selftest.invalid",SHA="a".repeat(40),TIME="2026-10-29T00:00:00Z";
    static void require(boolean value,String text){if(!value)throw new AssertionError(text);checks++;}
    interface Attempt{void run()throws Exception;}
    static void denied(Attempt value)throws Exception{try{value.run();throw new AssertionError("Unsafe board operation accepted");}catch(IOException expected){checks++;}}
    static JSONObject input(String operation,boolean gh)throws Exception{return new JSONObject().put("action","work-board-"+operation).put("provider",gh?"github":"gitlab").put("repository",REPO).put("ref",SHA).put("file","board.kicad_pcb").put("boardId",gh?"PVT_1":1);}
    static JSONObject connection(JSONArray rows)throws Exception{return new JSONObject().put("nodes",rows).put("pageInfo",new JSONObject().put("hasNextPage",false).put("endCursor",JSONObject.NULL));}
    static JSONObject repo()throws Exception{return new JSONObject().put("nameWithOwner",REPO);}
    static JSONObject issue()throws Exception{return new JSONObject().put("iid",42).put("project_id",7).put("title","Fix U1").put("labels",new JSONArray().put("Doing").put("Review").put("unrelated")).put("state","opened").put("updated_at",TIME).put("assignees",new JSONArray().put(new JSONObject().put("username","reviewer")));}
    static JSONObject board()throws Exception{return new JSONObject().put("id",1).put("name","Hardware").put("project",new JSONObject().put("id",7)).put("labels",new JSONArray()).put("lists",new JSONArray().put(new JSONObject().put("id",3).put("label",new JSONObject().put("name","Doing"))).put(new JSONObject().put("id",4).put("label",new JSONObject().put("name","Review"))));}
    static JSONObject fields()throws Exception{return connection(new JSONArray().put(new JSONObject().put("optionId","todo").put("field",new JSONObject().put("id","FIELD_1"))));}
    static JSONObject project()throws Exception{return new JSONObject().put("id","PVT_1").put("title","Hardware").put("url","https://github.com/orgs/owner/projects/1").put("repositories",connection(new JSONArray().put(repo()))).put("fields",connection(new JSONArray().put(new JSONObject().put("id","FIELD_1").put("name","Status").put("options",new JSONArray().put(new JSONObject().put("id","todo").put("name","Todo")).put(new JSONObject().put("id","done").put("name","Done")))))).put("items",connection(new JSONArray().put(new JSONObject().put("id","ITEM_1").put("fieldValues",fields()).put("content",new JSONObject().put("__typename","Issue").put("number",42).put("title","Fix U1").put("repository",repo()).put("assignees",connection(new JSONArray().put(new JSONObject().put("login","reviewer"))))))));}
    static final class Fixture implements NativeWorkBoards.Transport {
        int reads,writes,authorized;boolean wrongProject,scoped,denyWrites,unconfirmed,failWrite;JSONObject written;String query="";
        public void authorize(boolean write)throws Exception{if(write){authorized++;if(denyWrites)throw new IOException("Managed write denial");}}
        public JSONObject graphql(String q,JSONObject vars)throws Exception{
            query=q;if(q.startsWith("mutation")){writes++;written=vars.getJSONObject("input");if(failWrite)throw new IOException("Unconfirmed request");String operation=q.contains("ClearProject")?"clearProjectV2ItemFieldValue":"updateProjectV2ItemFieldValue";return new JSONObject().put(operation,new JSONObject().put("projectV2Item",new JSONObject().put("id",unconfirmed?"OTHER":"ITEM_1")));}
            reads++;
            if(q.contains("projectsV2(first:20"))return new JSONObject().put("repository",new JSONObject().put("projectsV2",connection(new JSONArray().put(new JSONObject().put("id","PVT_1").put("title","Hardware").put("number",1).put("url","https://github.com/orgs/owner/projects/1").put("closed",false)))));
            if(q.contains("... on ProjectV2Item{"))return new JSONObject().put("node",new JSONObject().put("id","ITEM_1").put("project",new JSONObject().put("id",wrongProject?"PVT_OTHER":"PVT_1")).put("fieldValues",fields()).put("content",new JSONObject().put("repository",repo())));
            JSONObject p=project();if(wrongProject)p.getJSONObject("repositories").put("nodes",new JSONArray());return new JSONObject().put("node",p);
        }
        public JSONObject get(String path)throws Exception{
            reads++;if(path.equals("/projects/owner%2Fboard"))return new JSONObject().put("id",7).put("path_with_namespace",REPO);
            if(path.equals("/projects/7/boards/1")){JSONObject b=board();if(scoped)b.put("milestone",new JSONObject().put("id",1));return b;}
            if(path.equals("/projects/7/issues/42")){JSONObject issue=issue();if(wrongProject)issue.put("project_id",99);return issue;}throw new AssertionError("Unexpected GET "+path);
        }
        public JSONArray list(String path)throws Exception{reads++;return path.contains("/boards?")?new JSONArray().put(board()):new JSONArray().put(issue());}
        public JSONObject put(String path,JSONObject body)throws Exception{require(path.equals("/projects/7/issues/42"),"Write escaped issue endpoint");writes++;written=body;if(failWrite)throw new IOException("Unconfirmed write");JSONObject issue=issue();if(body.optString("state_event").equals("close"))issue.put("state","closed");JSONArray labels=new JSONArray();for(String value:new String[]{"Doing","Review","unrelated"})if(!java.util.Arrays.asList(body.optString("remove_labels").split(",")).contains(value))labels.put(value);if(!body.optString("add_labels").isEmpty()&&!labels.toString().contains(body.optString("add_labels")))labels.put(body.getString("add_labels"));issue.put("labels",labels);if(unconfirmed)issue.put("iid",43);return issue;}
    }
    static JSONObject execute(JSONObject request,boolean gh,Fixture f)throws Exception{return NativeWorkBoards.handle(request,gh,gh?"https://github.com":HOST,f);}
    static int run()throws Exception {
        checks=0;
        for(boolean gh:new boolean[]{true,false}){
            Fixture f=new Fixture();JSONObject listed=execute(input("list",gh),gh,f);require(listed.getJSONArray("boards").length()==1,"Board discovery failed");require(!listed.getBoolean("hasMore"),"Invented pagination");
            JSONObject result=execute(input("read",gh),gh,f);require(result.getJSONArray("items").length()==1,"Board issue missing");require(result.getJSONArray("items").getJSONObject(0).getJSONArray("assignees").getString(0).equals("reviewer"),"Assignee missing");require(result.getJSONArray("columns").length()==(gh?3:4),"Columns invented or omitted");if(!gh)require(result.getJSONArray("items").getJSONObject(0).getJSONArray("columnIds").length()==2,"Multiple label membership lost");
            JSONObject move=input("move",gh).put("itemId",gh?"ITEM_1":42);if(gh)move.put("optionId","done").put("expectedColumnId","todo");else move.put("listId",4).put("fromListId",3).put("expectedUpdatedAt",TIME);
            require(execute(move,gh,f).getBoolean("updated")&&f.writes==1&&f.authorized==1,"Native board move failed");if(gh)require(f.written.getJSONObject("value").getString("singleSelectOptionId").equals("done")&&!f.written.has("state"),"Project move changed issue state");else require(f.written.getString("remove_labels").equals("Doing")&&!f.written.has("labels"),"GitLab move replaced unrelated labels");
            for(String fault:new String[]{"wrongProject","denyWrites","unconfirmed","failWrite"}){Fixture bad=new Fixture();bad.wrongProject=fault.equals("wrongProject");bad.denyWrites=fault.equals("denyWrites");bad.unconfirmed=fault.equals("unconfirmed");bad.failWrite=fault.equals("failWrite");denied(()->execute(move,gh,bad));require(bad.writes==(fault.equals("unconfirmed")||fault.equals("failWrite")?1:0),"Unsafe retry or mutation");}
            JSONObject stale=new JSONObject(move.toString()).put(gh?"expectedColumnId":"expectedUpdatedAt","stale");Fixture bad=new Fixture();denied(()->execute(stale,gh,bad));require(bad.writes==0,"Stale task was overwritten");
            for(JSONObject invalid:new JSONObject[]{input("read",gh).put("repository","../secret"),input("read",gh).put("ref","main"),input("read",gh).put("file","../board.kicad_pcb"),input("read",gh).put("provider",gh?"gitlab":"github")}){Fixture api=new Fixture();denied(()->execute(invalid,gh,api));require(api.reads==0&&api.writes==0,"Invalid request reached transport");}
        }
        Fixture scoped=new Fixture();scoped.scoped=true;denied(()->execute(input("read",false),false,scoped));
        Fixture clear=new Fixture();JSONObject clearInput=input("move",true).put("itemId","ITEM_1").put("optionId","");execute(clearInput,true,clear);require(!clear.written.has("value"),"Clearing status wrote an invented option");
        for(String target:new String[]{"open","closed"}){Fixture f=new Fixture();execute(input("move",false).put("itemId",42).put("listId",target),false,f);require(target.equals("open")?f.written.getString("remove_labels").equals("Doing,Review"):f.written.getString("state_event").equals("close"),"Native Open/Closed semantics failed");}
        for(String[] pair:new String[][]{{"public_repo notifications","repo"},{"public_repo notifications project","public_repo,project"},{"repo notifications project","repo project"}}){NativeWorkBoards.verifyGithubScopes(pair[0],pair[1]);checks++;}
        denied(()->NativeWorkBoards.verifyGithubScopes("repo project","public_repo project"));denied(()->NativeWorkBoards.verifyGithubScopes("public_repo project","public_repo"));
        require(GitHubClient.cancellableRead("work-board-read")&&GitLabClient.cancellableRead("work-board-list"),"Board reads cannot be cancelled");require(!GitHubClient.cancellableRead("work-board-move")&&!GitLabClient.cancellableRead("work-board-move"),"Mutation treated as a cancellable read");
        EnterprisePolicy policy=EnterprisePolicy.from(java.util.Map.of("disable_provider_writes",true));require(policy.allowsAction("work-board-read")&&!policy.allowsAction("work-board-move"),"Board bypassed managed policy");return checks;
    }
}
