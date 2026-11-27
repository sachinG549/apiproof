import { NextResponse } from "next/server";
import { UserError } from "@/lib/errors";

export async function respond(action: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Something went wrong while handling that request." }, { status: 500 });
  }
}
