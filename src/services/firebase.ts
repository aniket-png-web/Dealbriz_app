import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  getDocFromServer,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

/* CRITICAL: Must pass firebaseConfig.firestoreDatabaseId to getFirestore */
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('[Firebase] Connection verified successfully');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or database initializing.');
    }
  }
}

// Google Sign-In with Firebase Auth
export async function signInWithGoogle(): Promise<FirebaseUser> {
  try {
    googleProvider.setCustomParameters({
      prompt: 'select_account',
    });
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Record user profile in Firestore
    const userDocRef = doc(db, 'users', user.uid);
    try {
      await setDoc(
        userDocRef,
        {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || user.email?.split('@')[0] || 'User',
          photoURL: user.photoURL || '',
          notificationsEnabled: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (fsErr) {
      console.warn('Could not sync user to Firestore:', fsErr);
    }

    return user;
  } catch (error: any) {
    console.error('Firebase Google sign-in failed:', error);
    throw error;
  }
}

export async function logOutFirebase(): Promise<void> {
  await firebaseSignOut(auth);
}

// Sync OneSignal push subscription ID to Firestore user document
export async function syncOneSignalToFirestore(userId: string, playerId: string): Promise<void> {
  if (!userId || !playerId) return;
  const userRef = doc(db, 'users', userId);
  try {
    await updateDoc(userRef, {
      onesignalPlayerId: playerId,
      notificationsEnabled: true,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    try {
      await setDoc(
        userRef,
        {
          uid: userId,
          email: auth.currentUser?.email || '',
          displayName: auth.currentUser?.displayName || 'User',
          onesignalPlayerId: playerId,
          notificationsEnabled: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Could not save OneSignal playerId to Firestore:', e);
    }
  }
}
