
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  type DocumentData,
  type Unsubscribe
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export type BusinessModule =
  | "products"
  | "sales"
  | "expenses"
  | "customers"
  | "suppliers"
  | "employees"
  | "invoices"
  | "tasks"
  | "stockMovements"
  | "notifications";

export type BusinessRecord = {
  id: string;
  [key: string]: unknown;
};

export type Workspace = {
  id: string;
  name: string;
  ownerId: string;
  currency: string;
  country: string;
  createdAt?: unknown;
};

export async function createWorkspace(
  uid: string,
  name: string,
  currency = "USD",
  country = ""
) {
  const workspaceRef = doc(collection(db, "organizations"));
  const memberRef = doc(
    db,
    "organizations",
    workspaceRef.id,
    "members",
    uid
  );

  await runTransaction(db, async (transaction) => {
    transaction.set(workspaceRef, {
      name: name.trim(),
      ownerId: uid,
      currency,
      country,
      createdAt: serverTimestamp()
    });

    transaction.set(memberRef, {
      uid,
      role: "owner",
      status: "active",
      joinedAt: serverTimestamp()
    });
  });

  return workspaceRef.id;
}

export async function getWorkspace(
  workspaceId: string
): Promise<Workspace | null> {
  const snapshot = await getDoc(
    doc(db, "organizations", workspaceId)
  );

  if (!snapshot.exists()) return null;

  return {
    id: snapshot.id,
    ...snapshot.data()
  } as Workspace;
}

export async function isWorkspaceMember(
  workspaceId: string,
  uid: string
) {
  const snapshot = await getDoc(
    doc(db, "organizations", workspaceId, "members", uid)
  );

  return snapshot.exists() && snapshot.data().status === "active";
}

export function listenToRecords(
  workspaceId: string,
  module: BusinessModule,
  callback: (records: BusinessRecord[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "organizations", workspaceId, module),
    (snapshot) => {
      const records = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      })) as BusinessRecord[];

      callback(records);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function addRecord(
  workspaceId: string,
  module: BusinessModule,
  data: DocumentData
) {
  return addDoc(
    collection(db, "organizations", workspaceId, module),
    {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }
  );
}

export async function updateRecord(
  workspaceId: string,
  module: BusinessModule,
  recordId: string,
  data: DocumentData
) {
  return updateDoc(
    doc(db, "organizations", workspaceId, module, recordId),
    {
      ...data,
      updatedAt: serverTimestamp()
    }
  );
}

export async function removeRecord(
  workspaceId: string,
  module: BusinessModule,
  recordId: string
) {
  return deleteDoc(
    doc(db, "organizations", workspaceId, module, recordId)
  );
}
