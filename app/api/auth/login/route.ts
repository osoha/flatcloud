import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
export async function POST(req:Request){const form=await req.formData();const email=String(form.get("email")||"").toLowerCase();const password=String(form.get("password")||"");const user=await prisma.user.findUnique({where:{email}});if(!user||!user.active||!(await bcrypt.compare(password,user.passwordHash)))return NextResponse.redirect(new URL("/login?error=1",req.url),303);await createSession(user.id);await prisma.auditLog.create({data:{userId:user.id,action:"LOGIN",entityType:"User",entityId:user.id}});return NextResponse.redirect(new URL("/portfolio",req.url),303)}
