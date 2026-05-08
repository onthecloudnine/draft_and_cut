import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function serializeDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
