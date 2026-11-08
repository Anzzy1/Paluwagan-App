import { Redirect } from 'expo-router';

/** Landing route for the Google / Facebook sign-in redirect on native; the session is set by src/lib/oauth.ts. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
