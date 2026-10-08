package dev.kicadvizdiff.android;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;

/** Runs the production ZIP reader on a local JVM, without Android or network mocks. */
public final class ZipProjectReaderTest {
    static int checks;
    static void check(boolean value) { if (!value) throw new AssertionError(); checks++; }
    static boolean supported(String path) { return path.endsWith(".kicad_sch") || path.endsWith(".step"); }
    interface Task { void run() throws Exception; }
    static void fails(Task task, String message) throws Exception {
        try { task.run(); throw new AssertionError("Expected " + message); }
        catch (IOException error) { check(error.getMessage().contains(message)); }
    }
    static void member(ZipOutputStream zip, String name, int bytes, boolean stored) throws Exception {
        ZipEntry entry = new ZipEntry(name); byte[] block = new byte[65536]; Arrays.fill(block, (byte)'a');
        if (stored) { CRC32 crc = new CRC32(); for (int left=bytes;left>0;left-=Math.min(left,block.length)) crc.update(block,0,Math.min(left,block.length));
            entry.setMethod(ZipEntry.STORED);entry.setSize(bytes);entry.setCompressedSize(bytes);entry.setCrc(crc.getValue()); }
        zip.putNextEntry(entry);
        for (int left=bytes;left>0;left-=Math.min(left,block.length)) zip.write(block,0,Math.min(left,block.length));
        zip.closeEntry();
    }
    static File archive(Path root, String name, String member, int bytes) throws Exception {
        File file=root.resolve(name).toFile();
        try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(file))) {member(zip,member,bytes,true);}
        return file;
    }
    static void read(File file) throws Exception { ZipProjectReader.read(file,()->false,ZipProjectReaderTest::supported,(p,b)->{}); }
    public static void main(String[] args) throws Exception {
        Path root=Files.createTempDirectory("kicad-zip-tests");
        try {
            File mixed=root.resolve("mixed.zip").toFile();
            try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(mixed))) {
                member(zip,"repo/docs/manual.pdf",110*1024*1024,false);
                member(zip,"repo/media/large.bin",50*1024*1024,true);
                member(zip,"repo/design/sub/sheet.kicad_sch",64,true);
            }
            List<String> paths=new ArrayList<>();
            ZipProjectReader.read(mixed,()->false,ZipProjectReaderTest::supported,(p,b)->{paths.add(p);check(b.length==64);});
            check(paths.equals(List.of("repo/design/sub/sheet.kicad_sch")));check(mixed.length()>50*1024*1024);
            File staged=root.resolve("staged.zip").toFile();
            try(InputStream input=new FileInputStream(mixed)){ZipProjectReader.stage(input,staged,()->false);}
            check(staged.length()==mixed.length()); read(staged); checks++;
            fails(()->read(archive(root,"oversized.zip","large.step",33*1024*1024)),"32 MiB");
            File total=root.resolve("total.zip").toFile();
            try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(total))) {
                for(int i=0;i<4;i++)member(zip,i+".step",25*1024*1024,true);
            }
            fails(()->read(total),"96 MiB");
            fails(()->read(archive(root,"unsafe.zip","../sheet.kicad_sch",10)),"Unsafe ZIP path");
            File duplicate=root.resolve("duplicate.zip").toFile();
            try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(duplicate))) {member(zip,"A.kicad_sch",10,true);member(zip,"a.kicad_sch",10,true);}
            fails(()->read(duplicate),"Duplicate ZIP path");
            File corrupt=archive(root,"corrupt.zip","sheet.kicad_sch",64);
            try(RandomAccessFile file=new RandomAccessFile(corrupt,"rw")){file.seek(30+"sheet.kicad_sch".length());file.write(0);}
            fails(()->read(corrupt),"Corrupt ZIP member");
            File link=archive(root,"link.zip","sheet.kicad_sch",64);
            byte[] data=Files.readAllBytes(link.toPath());
            for(int i=0;i<data.length-46;i++)if(data[i]==0x50&&data[i+1]==0x4b&&data[i+2]==1&&data[i+3]==2){data[i+40]=(byte)0xff;data[i+41]=(byte)0xa1;break;}
            Files.write(link.toPath(),data);fails(()->read(link),"symbolic links");
            fails(()->ZipProjectReader.read(mixed,()->true,ZipProjectReaderTest::supported,(p,b)->{}),"cancelled");
            fails(()->ZipProjectReader.stage(new ByteArrayInputStream(new byte[2]),staged,()->true),"cancelled");
            File truncated=archive(root,"truncated.zip","sheet.kicad_sch",64);
            try(RandomAccessFile file=new RandomAccessFile(truncated,"rw")){file.setLength(file.length()-5);}
            fails(()->read(truncated),"incomplete ZIP");
            System.out.println(checks+" production ZIP reader checks passed");
        } finally {
            try(var files=Files.list(root)){for(Path path:files.toList())Files.delete(path);} Files.delete(root);
        }
    }
}
