package dev.kicadvizdiff.android;
public final class RepositorySourcePolicyTest {
    public static void main(String[] args) {
        String host="https://github.com", path="/owner/repo/blob/"+"a".repeat(40)+"/models/a%20b.step";
        if (!NativeBridgePolicy.repositorySource(host+path,host)) throw new AssertionError("pinned source");
        for(String address:new String[]{"http://github.com"+path,"https://github.com.evil.test"+path,"https://github.com@evil.test"+path,host+path+"?token=secret",host+path+"#fragment","file:///etc/passwd",null})
            if(NativeBridgePolicy.repositorySource(address,host)) throw new AssertionError("unsafe source accepted: "+address);
        if(NativeBridgePolicy.repositorySource(host+path,null)) throw new AssertionError("local projects grant no source host");
        if(!NativeBridgePolicy.repositorySource("https://git.example:8443/team/repo/-/blob/abc/board", "https://git.example:8443")) throw new AssertionError("self hosted");
        System.out.println("Repository source policy: 10 checks passed");
    }
}
