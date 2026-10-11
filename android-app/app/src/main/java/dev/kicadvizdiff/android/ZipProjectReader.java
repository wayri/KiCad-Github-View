package dev.kicadvizdiff.android;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.Predicate;
import java.util.zip.*;

/** Disk-backed ZIP selection: unsupported members are never decompressed. */
final class ZipProjectReader {
    static final long ARCHIVE_LIMIT = 1024L * 1024 * 1024;
    static final long DISK_FILE_LIMIT = 256L * 1024 * 1024, DISK_TOTAL_LIMIT = 1024L * 1024 * 1024;
    static final int FILE_LIMIT = 32 * 1024 * 1024, TOTAL_LIMIT = 96 * 1024 * 1024;
    static final int ENTRY_LIMIT = 10000, FILE_COUNT_LIMIT = 2000;
    interface Cancelled { boolean get(); }
    interface Sink { void accept(String path, byte[] content) throws Exception; }
    interface Extractor { void extract(String path, File destination) throws Exception; }
    interface DiskSink { void accept(List<Member> members, Extractor extractor) throws Exception; }
    static final class Member {
        final String path; final long size;
        Member(String path, long size) { this.path=path; this.size=size; }
    }
    private ZipProjectReader() { }
    static void check(Cancelled cancelled) throws IOException {
        if (cancelled.get() || Thread.currentThread().isInterrupted()) throw new IOException("Import cancelled");
    }
    static void stage(InputStream input, File destination, Cancelled cancelled) throws IOException {
        long total = 0;
        try (OutputStream output = new FileOutputStream(destination)) {
            byte[] buffer = new byte[65536]; int count;
            while ((count = input.read(buffer)) != -1) {
                check(cancelled); total += count;
                if (total > ARCHIVE_LIMIT) throw new IOException("ZIP archive exceeds 1 GiB. Open the extracted project folder instead.");
                output.write(buffer, 0, count);
            }
        }
    }
    static void read(File archive, Cancelled cancelled, Predicate<String> supported, Sink sink) throws Exception {
        if (archive.length() > ARCHIVE_LIMIT) throw new IOException("ZIP archive exceeds 1 GiB");
        Set<String> allowed = inspect(archive, cancelled, supported);
        long total = 0; int count = 0;
        try (ZipFile zip = new ZipFile(archive, java.nio.charset.Charset.forName("CP437"))) {
            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                check(cancelled); ZipEntry entry = entries.nextElement();
                if (entry.isDirectory()) continue;
                String path = entry.getName();
                if (!allowed.remove(path.toLowerCase(Locale.ROOT))) throw new IOException("ZIP directory mismatch");
                if (!supported.test(path)) continue;
                if (++count > FILE_COUNT_LIMIT) throw new IOException("Too many KiCad files (limit 2000)");
                if (entry.getSize() < 0 || entry.getSize() > FILE_LIMIT)
                    throw new IOException("KiCad ZIP member exceeds 32 MiB: " + path);
                if (entry.getSize() > TOTAL_LIMIT - total)
                    throw new IOException("Supported KiCad files exceed 96 MiB. Open a smaller project folder.");
                long bytes = 0; CRC32 crc = new CRC32();
                try (InputStream input = zip.getInputStream(entry); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[65536]; int n;
                    while ((n = input.read(buffer)) != -1) {
                        check(cancelled); bytes += n;
                        if (bytes > FILE_LIMIT) throw new IOException("KiCad ZIP member exceeds 32 MiB: " + path);
                        if (bytes > TOTAL_LIMIT - total) throw new IOException("Supported KiCad files exceed 96 MiB");
                        crc.update(buffer, 0, n); output.write(buffer, 0, n);
                    }
                    if (bytes != entry.getSize() || crc.getValue() != entry.getCrc()) throw new IOException("Corrupt ZIP member: " + path);
                    if (bytes > 1024 * 1024 && entry.getCompressedSize() > 0 && bytes / entry.getCompressedSize() > 1000)
                        throw new IOException("ZIP compression ratio exceeds safe limit: " + path);
                    total += bytes; sink.accept(path, output.toByteArray());
                }
            }
        }
        if (!allowed.isEmpty()) throw new IOException("Incomplete ZIP archive");
    }
    /** Keep the ZIP open while the store streams selected members into its transaction. */
    static void readDisk(File archive, Cancelled cancelled, Predicate<String> supported, DiskSink sink) throws Exception {
        if (archive.length() > ARCHIVE_LIMIT) throw new IOException("ZIP archive exceeds 1 GiB");
        Set<String> allowed=inspect(archive,cancelled,supported);
        try (ZipFile zip=new ZipFile(archive, java.nio.charset.Charset.forName("CP437"))) {
            Map<String,ZipEntry> selected=new LinkedHashMap<>(); List<Member> members=new ArrayList<>(); long total=0;
            Enumeration<? extends ZipEntry> entries=zip.entries();
            while(entries.hasMoreElements()) {
                check(cancelled); ZipEntry entry=entries.nextElement(); if(entry.isDirectory())continue;
                String path=entry.getName(); if(!allowed.remove(path.toLowerCase(Locale.ROOT)))throw new IOException("ZIP directory mismatch");
                if(!supported.test(path))continue;
                long size=entry.getSize();
                if(size<0||size>DISK_FILE_LIMIT)throw new IOException("KiCad ZIP member exceeds 256 MiB: "+path);
                if(size>DISK_TOTAL_LIMIT-total)throw new IOException("Supported KiCad files exceed 1 GiB");
                if(members.size()>=FILE_COUNT_LIMIT)throw new IOException("Too many KiCad files (limit 2000)");
                if(size>1024*1024&&entry.getCompressedSize()>0&&size/entry.getCompressedSize()>1000)
                    throw new IOException("ZIP compression ratio exceeds safe limit: "+path);
                total+=size; selected.put(path,entry); members.add(new Member(path,size));
            }
            if(!allowed.isEmpty())throw new IOException("Incomplete ZIP archive");
            sink.accept(Collections.unmodifiableList(members),(path,destination)-> {
                check(cancelled); ZipEntry entry=selected.get(path); if(entry==null)throw new IOException("Unknown ZIP member");
                long bytes=0; CRC32 crc=new CRC32();
                try(InputStream input=zip.getInputStream(entry); OutputStream output=new FileOutputStream(destination)) {
                    byte[] buffer=new byte[65536]; int n;
                    while((n=input.read(buffer))!=-1) {
                        check(cancelled); bytes+=n;
                        if(bytes>entry.getSize()||bytes>DISK_FILE_LIMIT)throw new IOException("ZIP member size mismatch: "+path);
                        crc.update(buffer,0,n);output.write(buffer,0,n);
                    }
                }
                if(bytes!=entry.getSize()||crc.getValue()!=entry.getCrc())throw new IOException("Corrupt ZIP member: "+path);
            });
        }
    }
    private static String safePath(String path) throws IOException {
        if (path.isEmpty() || path.length() > 500) throw new IOException("Unsafe ZIP path");
        for (String segment : path.split("/", -1)) {
            if (segment.isEmpty() || segment.equals(".") || segment.equals("..") || segment.indexOf('\\') >= 0 || segment.indexOf(':') >= 0)
                throw new IOException("Unsafe ZIP path");
            for (int i = 0; i < segment.length(); i++) if (Character.isISOControl(segment.charAt(i))) throw new IOException("Unsafe ZIP path");
        }
        return path;
    }
    // Central metadata is inspected before opening any member, including Unix link flags.
    private static Set<String> inspect(File archive, Cancelled cancelled, Predicate<String> supported) throws IOException {
        try (RandomAccessFile file = new RandomAccessFile(archive, "r")) {
            long length = file.length(); int tailLength = (int)Math.min(length, 65557);
            byte[] tail = new byte[tailLength]; file.seek(length - tailLength); file.readFully(tail);
            int end = -1;
            for (int i = tail.length - 22; i >= 0; i--)
                if (u32(tail, i) == 0x06054b50L && i + 22 + u16(tail, i + 20) == tail.length) { end = i; break; }
            if (end < 0 || u16(tail, end + 4) != 0 || u16(tail, end + 6) != 0) throw new IOException("Unsupported or incomplete ZIP archive");
            int number = u16(tail, end + 10); long size = u32(tail, end + 12), start = u32(tail, end + 16);
            long endOffset = length - tailLength + end;
            if (number != u16(tail, end + 8) || number > ENTRY_LIMIT || start + size != endOffset)
                throw new IOException("ZIP directory exceeds safe limits or uses unsupported ZIP64");
            Set<String> names = new HashSet<>(), files = new HashSet<>(); file.seek(start);
            byte[] header = new byte[46];
            for (int i = 0; i < number; i++) {
                check(cancelled);
                if (file.getFilePointer() + 46 > endOffset) throw new IOException("Invalid ZIP directory");
                file.readFully(header);
                if (u32(header, 0) != 0x02014b50L) throw new IOException("Invalid ZIP directory");
                int flags = u16(header, 8), method = u16(header, 10);
                int nameLength = u16(header, 28), extra = u16(header, 30), comment = u16(header, 32);
                if ((flags & 1) != 0 || (method != 0 && method != 8) || file.getFilePointer() + nameLength + extra + comment > endOffset)
                    throw new IOException("Unsupported ZIP entry");
                int mode = (int)(u32(header, 38) >>> 16);
                if ((mode & 0170000) == 0120000) throw new IOException("ZIP symbolic links are unsupported");
                byte[] name = new byte[nameLength]; file.readFully(name);
                String path = new String(name, (flags & 2048) != 0 ? StandardCharsets.UTF_8 : java.nio.charset.Charset.forName("CP437"));
                boolean directory = path.endsWith("/"); safePath(directory ? path.substring(0, path.length() - 1) : path);
                if ((mode & 0111) != 0 && supported.test(path)) throw new IOException("Executable project entries are unsupported");
                String lower = path.toLowerCase(Locale.ROOT);
                if (!names.add(lower)) throw new IOException("Duplicate ZIP path");
                if (!directory) files.add(lower);
                file.seek(file.getFilePointer() + extra + comment);
            }
            if (file.getFilePointer() != start + size) throw new IOException("Invalid ZIP directory size");
            return files;
        }
    }
    private static int u16(byte[] data, int offset) { return (data[offset] & 255) | ((data[offset + 1] & 255) << 8); }
    private static long u32(byte[] data, int offset) { return u16(data, offset) | ((long)u16(data, offset + 2) << 16); }
}
