package dev.kicadvizdiff.android;

public final class CameraPermissionPolicyTest {
    public static void main(String[] args) {
        String trusted="https://appassets.androidplatform.net";
        String[] video={CameraPermissionPolicy.VIDEO_CAPTURE};
        check(CameraPermissionPolicy.eligible(trusted,video,true,true),"foreground video allowed");
        check(CameraPermissionPolicy.eligible(trusted+":443/",video,true,true),"default TLS port allowed");
        for(String origin:new String[]{null,"http://appassets.androidplatform.net",trusted+":444",trusted+".evil.test",
                "https://appassets.androidplatform.net@evil.test",trusted+"/assets/viewer/index.html",trusted+"?camera",trusted+"#camera"})
            check(!CameraPermissionPolicy.eligible(origin,video,true,true),"foreign/non-origin rejected");
        check(!CameraPermissionPolicy.eligible(trusted,video,false,true),"untrusted shell rejected");
        check(!CameraPermissionPolicy.eligible(trusted,video,true,false),"background rejected");
        for(String[] resources:new String[][]{null,{}, {"android.webkit.resource.AUDIO_CAPTURE"},
                {CameraPermissionPolicy.VIDEO_CAPTURE,"android.webkit.resource.AUDIO_CAPTURE"},
                {CameraPermissionPolicy.VIDEO_CAPTURE,CameraPermissionPolicy.VIDEO_CAPTURE}, {"future-resource"}})
            check(!CameraPermissionPolicy.eligible(trusted,resources,true,true),"only a video resource allowed");
        System.out.println("Camera permission policy: 18 checks passed");
    }
    private static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
}
