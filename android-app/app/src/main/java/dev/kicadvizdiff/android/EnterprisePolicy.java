package dev.kicadvizdiff.android;

import java.util.Map;
import java.util.Set;

/** Managed state is independent of user preferences and project metadata. */
final class EnterprisePolicy {
    static final Set<String> KEYS=Set.of("disable_network","disable_provider_writes","secure_screen","restrictions_pending");
    private static final Set<String> WRITES=Set.of("repository-fork-revision","review-publish","review-upload","publish","upload","chat-message-write","chat-thread-state","chat-reaction");
    final boolean network,providerWrites,secureScreen;
    private EnterprisePolicy(boolean network,boolean writes,boolean secure){this.network=network;providerWrites=network&&writes;secureScreen=secure;}
    static EnterprisePolicy denied(){return new EnterprisePolicy(false,false,true);}
    static EnterprisePolicy from(Map<String,?> values){
        if(values==null)return denied();
        for(String key:KEYS)if(values.containsKey(key)&&!(values.get(key) instanceof Boolean))return denied();
        if(Boolean.TRUE.equals(values.get("restrictions_pending")))return denied();
        return new EnterprisePolicy(!Boolean.TRUE.equals(values.get("disable_network")),!Boolean.TRUE.equals(values.get("disable_provider_writes")),Boolean.TRUE.equals(values.get("secure_screen")));
    }
    boolean allowsAction(String action){return Set.of("sign-out","device-cancel").contains(action)||network&&(!WRITES.contains(action)||providerWrites);}
    static boolean readOnlyGraphql(String query){return query!=null&&query.stripLeading().matches("(?s)(?:query\\b.*|\\{.*)")&&!java.util.regex.Pattern.compile("\\bmutation\\b").matcher(query).find();}
}
