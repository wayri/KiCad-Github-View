package dev.kicadvizdiff.android;

import android.content.Context;
import android.content.RestrictionsManager;
import android.os.Bundle;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

final class ManagedPolicy {
    static final class Denied extends IOException {Denied(){super("This operation is disabled by your organization's managed application policy.");}}
    @SuppressWarnings("deprecation")
    static EnterprisePolicy read(Context context){
        try {
            RestrictionsManager manager=(RestrictionsManager)context.getSystemService(Context.RESTRICTIONS_SERVICE);
            if(manager==null)return EnterprisePolicy.denied();
            Bundle bundle=manager.getApplicationRestrictions();
            if(bundle==null)return EnterprisePolicy.denied();
            Map<String,Object> values=new HashMap<>();
            for(String key:EnterprisePolicy.KEYS)if(bundle.containsKey(key))values.put(key,bundle.get(key));
            return EnterprisePolicy.from(values);
        }catch(RuntimeException unavailable){return EnterprisePolicy.denied();}
    }
    static void requireAction(Context context,String action)throws Denied {if(!read(context).allowsAction(action))throw new Denied();}
    static void requireNetwork(Context context)throws Denied {if(!read(context).network)throw new Denied();}
    static void requireTransport(Context context,boolean write)throws Denied {EnterprisePolicy value=read(context);if(!value.network||write&&!value.providerWrites)throw new Denied();}
}
