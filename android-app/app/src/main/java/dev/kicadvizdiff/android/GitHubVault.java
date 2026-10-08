package dev.kicadvizdiff.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Only ciphertext is persisted; the non-exportable encryption key stays in AndroidKeyStore. */
final class GitHubVault {
    private final String alias;
    private final SharedPreferences preferences;
    GitHubVault(Context context) { this(context, "github"); }
    GitHubVault(Context context, String provider) {
        if (!provider.matches("[a-z0-9_]{1,100}")) throw new IllegalArgumentException("Invalid credential scope");
        alias = "kicadvizdiff." + provider + ".v1";
        preferences = context.getSharedPreferences(provider + "_credentials", Context.MODE_PRIVATE);
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(alias)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(alias, null);
    }
    String read() {
        try {
            String value = preferences.getString("ciphertext", null);
            if (value == null) return null;
            String[] pieces = value.split(":", -1);
            if (pieces.length != 2) throw new IllegalArgumentException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(pieces[0], Base64.NO_WRAP)));
            return new String(cipher.doFinal(Base64.decode(pieces[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception ignored) { clear(); return null; }
    }
    void write(String token) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        String value = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
                + Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        if (!preferences.edit().putString("ciphertext", value).commit()) throw new java.io.IOException("Cannot securely save account sign-in");
    }
    void clear() {
        preferences.edit().clear().commit();
        // Also invalidate any old ciphertext if a device fails to persist preference deletion.
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            if (store.containsAlias(alias)) store.deleteEntry(alias);
        } catch (Exception ignored) { }
    }
}
