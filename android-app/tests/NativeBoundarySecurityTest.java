package dev.kicadvizdiff.android;

/** Synthetic JVM checks; real WebView frame provenance still needs device instrumentation. */
public final class NativeBoundarySecurityTest {
    private static int checks;
    private static void check(boolean result) { if (!result) throw new AssertionError("Check " + checks); checks++; }
    public static void main(String[] args) {
        String origin="https://appassets.androidplatform.net";
        check(NativeBridgePolicy.trustedOrigin(origin,true));
        check(NativeBridgePolicy.trustedOrigin(origin+":443",true));
        check(!NativeBridgePolicy.trustedOrigin(origin,false));
        for(String foreign:new String[]{null,"null","file:///assets/viewer/index.html","content://appassets.androidplatform.net/", "http://appassets.androidplatform.net",origin+".evil.test", "https://user@appassets.androidplatform.net",origin+":8443",origin+"?origin=trusted",origin+"#trusted",origin+"/assets/viewer/index.html"}) {
            check(!NativeBridgePolicy.trustedOrigin(foreign,true));
            check(!NativeBridgePolicy.trustedOrigin(foreign,false));
        }
        for(String traversal:new String[]{"../private","%2e%2e/private","%2E%2E/private","%252e%252e/private","%5c..%5cprivate","..%2fprivate","a/%2e%2e/private","a/../private","./index.html","%255cprivate"})
            check(!NativeBridgePolicy.viewerResource(origin+"/assets/viewer/"+traversal));
        check(!NativeBridgePolicy.viewerResource(origin+"/assets/viewer-evil/index.html"));
        check(!NativeBridgePolicy.viewerResource("https://appassets.androidplatform.net.evil.test/assets/viewer/index.html"));
        check(NativeBridgePolicy.viewerResource(origin+"/assets/viewer/extension/viewer.html"));
        for(String kind:new String[]{"downloaded","temporary-downloads"})
            check(NativeBridgePolicy.importedResource(origin+"/assets/viewer/"+kind+"/"+"a".repeat(32)+"/0"));
        check(!NativeBridgePolicy.importedResource(origin+"/assets/viewer/extension/viewer.html"));

        for(String document:new String[]{"content://com.android.providers.downloads.documents/document/123","content://com.android.externalstorage.documents/tree/primary%3ADocuments/document/primary%3ADocuments%2Fboard.kicad_pcb","content://provider_with_underscore/item/1?mode=read"})
            check(NativeBridgePolicy.pickerContent(document));
        for(String hostile:new String[]{null,"file:///data/user/0/dev.kicadvizdiff.android/shared_prefs/settings.xml","file:///sdcard/board.kicad_pcb","android.resource://dev.kicadvizdiff.android/raw/private","https://evil.example/file","javascript:alert(1)","content:private","content:///private","content://user@provider/private","content://provider:123/private","content://provider\\evil/private","content://provider/private#fragment","content://provider\n/private"})
            check(!NativeBridgePolicy.pickerContent(hostile));

        NativeRequestGuard pending=new NativeRequestGuard();
        for(int i=0;i<8;i++)check(pending.admit(0));
        for(int i=0;i<1000;i++)check(!pending.admit(10000+i));
        pending.release();check(pending.admit(20000));
        NativeRequestGuard burst=new NativeRequestGuard();
        for(int i=0;i<24;i++){check(burst.admit(10000));burst.release();}
        check(!burst.admit(19999));check(burst.admit(20000));check(!burst.admit(19999));
        burst.dispatch(Runnable::run,()->burst.execute(Runnable::run,()->{}));
        check(burst.admit(20000));
        System.out.println("Native bridge origin/path/admission: "+checks+" checks passed");
    }
}
