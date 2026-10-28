package dev.kicadvizdiff.android;

import android.content.Context;
import android.net.Uri;
import android.util.Base64;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Local OAuth contracts; never contacts GitLab or stores a credential. */
final class OAuthConfigurationChecks {
    private static int checks;
    private interface Attempt { void run()throws Exception; }
    private static void require(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
    private static void denied(Attempt attempt)throws Exception {try{attempt.run();throw new AssertionError("Unsafe OAuth input accepted");}catch(IllegalArgumentException|java.io.IOException|org.json.JSONException expected){checks++;}}
    private static JSONObject token()throws Exception{return new JSONObject().put("access_token","a".repeat(30)).put("refresh_token","r".repeat(30)).put("token_type","Bearer").put("scope","api read_user").put("expires_in",7200);}
    static int run(Context context)throws Exception {
        checks=0;
        JSONObject publisherRequest=new JSONObject().put("type","oauth-start").put("host","https://gitlab.com");
        require(GitLabOAuthConfig.requestClientId(publisherRequest).isEmpty(),"Bridge must allow omitted publisher client ID");
        require(GitLabOAuthConfig.requestClientId(new JSONObject().put("clientId","explicit_public_id")).equals("explicit_public_id"),"Bridge must preserve an explicit public client ID");
        require(GitLabOAuthConfig.parse("{\"version\":1,\"gitlab\":{}}").isEmpty(),"Empty publisher config");
        require(GitLabOAuthConfig.parse("{\"version\":1,\"gitlab\":{\"https://gitlab.com\":{\"clientId\":\"publisher_public_id\"}}}").get("https://gitlab.com").equals("publisher_public_id"),"Publisher public ID");
        for(String text:new String[]{"{\"version\":1,\"gitlab\":{\"https://gitlab.com/\":{\"clientId\":\"publisher_public_id\"}}}","{\"version\":1,\"gitlab\":{\"https://gitlab.com\":{\"clientId\":\"publisher_public_id\",\"clientSecret\":\"forbidden\"}}}","{\"version\":2,\"gitlab\":{}}"})denied(()->GitLabOAuthConfig.parse(text));
        GitLabClient.validateOAuth(token());checks++;JSONObject unchangedScope=token();unchangedScope.remove("scope");GitLabClient.validateOAuth(unchangedScope);checks++;
        denied(()->GitLabClient.validateOAuth(token().put("token_type","Other")));
        denied(()->GitLabClient.validateOAuth(token().put("scope","read_user")));
        denied(()->GitLabClient.validateOAuth(token().put("refresh_token","short")));
        denied(()->GitLabClient.validateOAuth(token().put("expires_in",0)));
        final int[] network={0};GitLabClient client=new GitLabClient(context,url->{network[0]++;throw new java.io.IOException("Unexpected network");});
        denied(()->client.startOAuth("https://unconfigured-gitlab.invalid","",client.generation()));require(network[0]==0,"Unconfigured server contacted network");
        JSONObject publisherStarted=client.startOAuth("https://gitlab.com",GitLabOAuthConfig.requestClientId(publisherRequest),client.generation());
        require(Uri.parse(publisherStarted.getString("authorizationUri")).getQueryParameter("client_id").equals(GitLabOAuthConfig.resolve(context,"https://gitlab.com")),"Bridge publisher default did not reach native OAuth fallback");
        JSONObject started=client.startOAuth("https://gitlab.com","publisher_public_id",client.generation());Uri auth=Uri.parse(started.getString("authorizationUri"));
        require(auth.getHost().equals("gitlab.com")&&auth.getQueryParameter("redirect_uri").equals("kicadvizdiff://gitlab-oauth")&&auth.getQueryParameter("code_challenge_method").equals("S256"),"Exact publisher callback and PKCE");
        var field=GitLabClient.class.getDeclaredField("oauthVerifier");field.setAccessible(true);String verifier=(String)field.get(client);
        String expected=Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)),Base64.URL_SAFE|Base64.NO_PADDING|Base64.NO_WRAP);
        require(expected.equals(auth.getQueryParameter("code_challenge")),"PKCE challenge mismatch");
        String state=auth.getQueryParameter("state"),code="test_code_1234567890";
        for(String callback:new String[]{"kicadvizdiff://gitlab-oauth:99?state="+state+"&code="+code,"kicadvizdiff://gitlab-oauth?state="+state+"&state="+state+"&code="+code,"kicadvizdiff://gitlab-oauth?state="+state+"&code="+code+"&code="+code,"kicadvizdiff://gitlab-oauth?state="+state+"&code="+code+"&error=access_denied","kicadvizdiff://gitlab-oauth?state=foreign&code="+code})denied(()->client.completeOAuth(Uri.parse(callback),client.generation()));
        require(network[0]==0,"Rejected callback contacted network");
        client.cancelRequests();denied(()->client.completeOAuth(Uri.parse("kicadvizdiff://gitlab-oauth?state="+state+"&code="+code),client.generation()));
        require(network[0]==0,"Cancelled callback contacted network");return checks;
    }
}
