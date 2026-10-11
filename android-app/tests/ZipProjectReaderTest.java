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
    static void disk(File file, Path root) throws Exception {
        ZipProjectReader.readDisk(file,()->false,ZipProjectReaderTest::supported,(members,extractor)-> {
            for(ZipProjectReader.Member member:members) {
                File target=root.resolve("extracted").toFile();extractor.extract(member.path,target);
                check(target.length()==member.size);Files.delete(target.toPath());
            }
        });
    }
    // Alter central metadata to exercise preflight boundaries without allocating a GiB.
    static void metadataSize(File archive, long size) throws Exception {
        byte[] data=Files.readAllBytes(archive.toPath());
        for(int i=0;i<data.length-46;i++)if(data[i]==0x50&&data[i+1]==0x4b&&data[i+2]==1&&data[i+3]==2) {
            for(int b=0;b<4;b++){data[i+20+b]=(byte)(size>>(b*8));data[i+24+b]=(byte)(size>>(b*8));}
        }
        Files.write(archive.toPath(),data);
    }
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
            disk(root.resolve("oversized.zip").toFile(),root); // 33 MiB works without a byte[] payload.
            disk(total,root); // 100 MiB project works via sequential extraction.
            File boundary=archive(root,"boundary.zip","large.step",64);
            metadataSize(boundary,ZipProjectReader.DISK_FILE_LIMIT);
            ZipProjectReader.readDisk(boundary,()->false,ZipProjectReaderTest::supported,(members,extractor)->check(members.get(0).size==256L*1024*1024));
            metadataSize(boundary,ZipProjectReader.DISK_FILE_LIMIT+1);
            fails(()->disk(boundary,root),"256 MiB");
            File aggregate=root.resolve("aggregate.zip").toFile();
            try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(aggregate))) {
                for(int i=0;i<5;i++)member(zip,i+".step",64,true);
            }
            metadataSize(aggregate,ZipProjectReader.DISK_FILE_LIMIT);
            fails(()->disk(aggregate,root),"1 GiB");
            File exact=root.resolve("exact.zip").toFile();
            try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(exact))) {
                for(int i=0;i<4;i++)member(zip,i+".step",64,true);
            }
            metadataSize(exact,ZipProjectReader.DISK_FILE_LIMIT);
            ZipProjectReader.readDisk(exact,()->false,ZipProjectReaderTest::supported,(members,extractor)->check(members.size()==4));
            File many=root.resolve("many.zip").toFile();
            try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(many))) {
                for(int i=0;i<2001;i++)member(zip,i+".step",1,true);
            }
            fails(()->disk(many,root),"Too many KiCad files");
            File bomb=root.resolve("bomb.zip").toFile();
            try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(bomb))){member(zip,"large.step",10*1024*1024,false);}
            fails(()->disk(bomb,root),"compression ratio");
            fails(()->read(archive(root,"unsafe.zip","../sheet.kicad_sch",10)),"Unsafe ZIP path");
            File duplicate=root.resolve("duplicate.zip").toFile();
            try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(duplicate))) {member(zip,"A.kicad_sch",10,true);member(zip,"a.kicad_sch",10,true);}
            fails(()->read(duplicate),"Duplicate ZIP path");
            File corrupt=archive(root,"corrupt.zip","sheet.kicad_sch",64);
            try(RandomAccessFile file=new RandomAccessFile(corrupt,"rw")){file.seek(30+"sheet.kicad_sch".length());file.write(0);}
            fails(()->read(corrupt),"Corrupt ZIP member");
            fails(()->disk(corrupt,root),"Corrupt ZIP member");
            File link=archive(root,"link.zip","sheet.kicad_sch",64);
            byte[] data=Files.readAllBytes(link.toPath());
            for(int i=0;i<data.length-46;i++)if(data[i]==0x50&&data[i+1]==0x4b&&data[i+2]==1&&data[i+3]==2){data[i+40]=(byte)0xff;data[i+41]=(byte)0xa1;break;}
            Files.write(link.toPath(),data);fails(()->read(link),"symbolic links");
            fails(()->disk(link,root),"symbolic links");
            fails(()->disk(root.resolve("unsafe.zip").toFile(),root),"Unsafe ZIP path");
            fails(()->disk(duplicate,root),"Duplicate ZIP path");
            fails(()->ZipProjectReader.readDisk(mixed,()->true,ZipProjectReaderTest::supported,(members,extractor)->{}),"cancelled");
            boolean[] cancelled={false};
            fails(()->ZipProjectReader.readDisk(mixed,()->cancelled[0],ZipProjectReaderTest::supported,(members,extractor)-> {
                cancelled[0]=true;extractor.extract(members.get(0).path,root.resolve("cancelled").toFile());
            }),"cancelled");
            File encrypted=archive(root,"encrypted.zip","sheet.kicad_sch",64);
            byte[] encryptedData=Files.readAllBytes(encrypted.toPath());
            for(int i=0;i<encryptedData.length-46;i++)if(encryptedData[i]==0x50&&encryptedData[i+1]==0x4b&&encryptedData[i+2]==1&&encryptedData[i+3]==2){encryptedData[i+8]|=1;break;}
            Files.write(encrypted.toPath(),encryptedData);fails(()->disk(encrypted,root),"Unsupported ZIP entry");
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
