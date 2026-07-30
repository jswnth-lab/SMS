import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ApiError, getSession, signInWithPhone, signOut, type SessionUser } from './src/api';
import { clearToken, getToken, setToken } from './src/storage';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('+15550001111');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // On launch, restore whatever session token is stored and confirm it's
  // still valid - this is the same bearer-token path every subsequent
  // authenticated request will use.
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        const session = await getSession(token);
        if (session) setUser(session.user);
        else await clearToken();
      }
      setBooting(false);
    })();
  }, []);

  async function handleSignIn() {
    setError(null);
    setSubmitting(true);
    try {
      const token = await signInWithPhone(phoneNumber.trim(), password);
      await setToken(token);
      const session = await getSession(token);
      setUser(session?.user ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    const token = await getToken();
    if (token) await signOut(token);
    await clearToken();
    setUser(null);
  }

  if (booting) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Signed in</Text>
        <Text style={styles.subtitle}>{user.name}</Text>
        <Text style={styles.subtitle}>{user.phoneNumber ?? user.email}</Text>
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={handleSignOut}>
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>School SMS</Text>
      <Text style={styles.subtitle}>Sign in with your phone number</Text>

      <TextInput
        style={styles.input}
        placeholder="Phone number"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        keyboardType="phone-pad"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSignIn}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign in</Text>
        )}
      </Pressable>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    backgroundColor: '#999',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  error: {
    color: '#c0392b',
    fontSize: 14,
  },
});
