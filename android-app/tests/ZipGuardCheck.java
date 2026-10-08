package dev.kicadvizdiff.android;
import java.io.*;
import java.lang.reflect.*;
import java.util.*;
import java.util.zip.*;
public final class ZipGuardCheck {
    static Method inspect;
    static int checked;
    static byte[] zip(String... names) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            for (String name:names) { zip.putNextEntry(new ZipEntry(name)); zip.write("source".getBytes()); zip.closeEntry(); }
        }
        return out.toByteArray();
    }
    static Set<?> inspect(byte[] data) throws Exception {
        try { return (Set<?>) inspect.invoke(null, data, (ProjectImporter.Cancelled) () -> false); }
        catch (InvocationTargetException error) { throw (Exception) error.getCause(); }
    }
    static void reject(byte[] data) throws Exception {
        try { inspect(data); throw new AssertionError("Unsafe archive accepted"); } catch (IOException expected) { checked++; }
    }
    static byte[] mode(byte[] zip, int mode) {
        for(int i=0;i<zip.length-46;i++) if((zip[i]&255)==0x50&&(zip[i+1]&255)==0x4b&&(zip[i+2]&255)==1&&(zip[i+3]&255)==2) {
            zip[i+40]=(byte)mode; zip[i+41]=(byte)(mode>>>8); break;
        }
        return zip;
    }
    public static void main(String[] args) throws Exception {
        inspect = ProjectImporter.class.getDeclaredMethod("inspectZipDirectory", byte[].class, ProjectImporter.Cancelled.class);
        inspect.setAccessible(true);
        Set<?> files=inspect(zip("project/boards/a.kicad_pcb", "project/sheets/root.kicad_sch"));
        if(files.size()!=2)throw new AssertionError("Valid nested archive rejected");checked++;
        reject(zip("../escape.kicad_pcb"));
        reject(zip("/absolute.kicad_pcb"));
        reject(zip("dir\\escape.kicad_sch"));
        reject(zip("a.kicad_sch","A.kicad_sch"));
        reject(mode(zip("link.kicad_sch"),0120777));
        reject(mode(zip("run.kicad_sch"),0100755));
        reject(Arrays.copyOf(zip("a.kicad_pcb"),20));
        reject(zip("nested//a.kicad_sch"));
        ProjectImporter.safePath("boards/nested/a.kicad_pcb");checked++;
        System.out.println(checked+" native ZIP/path security checks passed");
    }
}
