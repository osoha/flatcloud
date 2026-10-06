"use client";
import {useEffect} from "react";

/** Record the mounted page, not a server render or a Next.js link prefetch. */
export function RecordActionOpened({packetId}:{packetId:string}){
  useEffect(()=>{
    void fetch(`/api/portal/actions/${packetId}`,{
      method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:"mode=open",cache:"no-store",
    }).catch(()=>{});
  },[packetId]);
  return null;
}
