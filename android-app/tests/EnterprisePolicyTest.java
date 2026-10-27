package dev.kicadvizdiff.android;
import java.util.*;
public final class EnterprisePolicyTest {
    static int checks;
    static void check(boolean value){if(!value)throw new AssertionError("Check "+checks);checks++;}
    public static void main(String[] args){
        EnterprisePolicy normal=EnterprisePolicy.from(Map.of());
        check(normal.network&&normal.providerWrites&&!normal.secureScreen);
        for(String action:new String[]{"import","device-start","token-connect","oauth-start","review-publish","review-upload","publish","upload","chat-message-write"})check(normal.allowsAction(action));
        EnterprisePolicy offline=EnterprisePolicy.from(Map.of("disable_network",true));
        check(!offline.network&&!offline.providerWrites);
        for(String action:new String[]{"import","revision-import","device-start","device-poll","token-connect","oauth-start","auth-status","review-publish","review-upload","publish","upload","chat-message-write"})check(!offline.allowsAction(action));
        check(offline.allowsAction("sign-out"));check(offline.allowsAction("device-cancel"));
        EnterprisePolicy readOnly=EnterprisePolicy.from(Map.of("disable_provider_writes",true));
        check(readOnly.network&&!readOnly.providerWrites);check(readOnly.allowsAction("import"));check(readOnly.allowsAction("device-start"));
        for(String action:new String[]{"review-publish","review-upload","publish","upload","chat-message-write","chat-reaction"})check(!readOnly.allowsAction(action));
        check(EnterprisePolicy.from(Map.of("secure_screen",true)).secureScreen);
        for(String key:EnterprisePolicy.KEYS)for(Object malformed:new Object[]{"false",0,List.of(),Map.of()}){
            EnterprisePolicy denied=EnterprisePolicy.from(Map.of(key,malformed));check(!denied.network&&!denied.providerWrites&&denied.secureScreen);
        }
        Map<String,Object> nullValue=new HashMap<>();nullValue.put("disable_network",null);check(!EnterprisePolicy.from(nullValue).network);
        check(!EnterprisePolicy.from(null).network);check(!EnterprisePolicy.from(Map.of("restrictions_pending",true)).network);
        check(EnterprisePolicy.readOnlyGraphql("query($id:ID!){node(id:$id){id}}"));check(EnterprisePolicy.readOnlyGraphql("{viewer{login}}"));
        for(String query:new String[]{"mutation{addComment{id}}","query A{viewer{id}} mutation B{addComment{id}}","", "subscription{event}","# comment\nmutation{addComment{id}}"})check(!EnterprisePolicy.readOnlyGraphql(query));
        check(!EnterprisePolicy.readOnlyGraphql(null));
        System.out.println("Enterprise policy: "+checks+" checks passed");
    }
}
