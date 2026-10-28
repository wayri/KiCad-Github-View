package dev.kicadvizdiff.android;

import java.io.IOException;
import java.util.Arrays;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONObject;

/** Explicit, revision-bound state changes. Remote IDs are always fetched natively. */
final class NativeThreadStateRequest {
    final String kind,state,expectedUpdatedAt;
    final int number;
    NativeThreadStateRequest(JSONObject request)throws Exception {
        for(Iterator<String> keys=request.keys();keys.hasNext();)if(!Arrays.asList("action","host","repository","ref","file","thread","state","expectedUpdatedAt","confirmed").contains(keys.next()))throw new IOException("Unsupported conversation state field");
        NativeChatRequest.validateScope(request.getString("ref"),request.getString("file"));
        JSONObject thread=request.getJSONObject("thread");
        kind=thread.getString("kind");long id=NativeChatRequest.remoteId(thread,"number");
        if(thread.length()!=2||!Arrays.asList("issue","discussion").contains(kind)||id>Integer.MAX_VALUE)throw new IOException("Invalid conversation identity");number=(int)id;
        state=request.getString("state");expectedUpdatedAt=request.getString("expectedUpdatedAt");
        if(!Boolean.TRUE.equals(request.opt("confirmed"))||!Arrays.asList("open","closed").contains(state)||!NativeChatRequest.timestamp(expectedUpdatedAt))throw new IOException("Confirm a valid conversation state and revision");
    }
    void checkRevision(String updatedAt,boolean closed)throws Exception {
        if(!expectedUpdatedAt.equals(updatedAt)||closed==state.equals("closed"))throw new IOException("Conversation state or revision changed; refresh before changing it");
    }
    static boolean gitlabAllowed(JSONObject project,JSONObject issue,long viewer)throws Exception {
        if(viewer<=0)return false;
        JSONObject author=issue.optJSONObject("author");if(author!=null&&viewer==author.optLong("id",0))return true;
        JSONArray assigned=issue.optJSONArray("assignees");if(assigned!=null){if(assigned.length()>1000)throw new IOException("Issue assignee list exceeds its limit");for(int i=0;i<assigned.length();i++)if(viewer==assigned.getJSONObject(i).optLong("id",0))return true;}
        JSONObject permissions=project.optJSONObject("permissions");if(permissions!=null)for(String name:new String[]{"project_access","group_access"}){JSONObject access=permissions.optJSONObject(name);if(access!=null&&access.opt("access_level")instanceof Number&&access.getDouble("access_level")==access.getInt("access_level")&&access.getInt("access_level")>=15)return true;}
        return false;
    }
}
