import { createClient } from "npm:@supabase/supabase-js@2.76.1";
const headers = {
  "Access-Control-Allow-Origin": "https://f-gav.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Cache-Control": "private, no-store",
  "Vary": "Origin"
};
const jsonError=(status:number,message:string)=>new Response(JSON.stringify({error:message}),{
  status,headers:{...headers,"Content-Type":"application/json"}
});
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return jsonError(405,"Method not allowed");
  const origin=req.headers.get("Origin");
  if(origin && origin!=="https://f-gav.github.io" && !/^http:\/\/localhost:\d+$/.test(origin)){
    return jsonError(403,"Origin forbidden");
  }
  try{
    if(Number(req.headers.get("content-length")||0)>1024)return jsonError(413,"Request too large");
    const input=await req.json();
    const token=input?.token, entryId=input?.entry_id;
    if(typeof token!=="string"||!(/^[0-9a-f]{64}$/.test(token))
       ||typeof entryId!=="string"||!(/^[0-9a-fA-F-]{36}$/.test(entryId))){
      return jsonError(400,"Invalid share request");
    }
    const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!key)return jsonError(503,"Service not configured");
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:path,error:rpcError}=await db.rpc("shared_image_path",{p_token:token,p_entry_id:entryId});
    if(rpcError||typeof path!=="string"||!path.endsWith(".webp"))return jsonError(404,"Image unavailable");
    const {data:blob,error:storageError}=await db.storage.from("wrecklib-images").download(path);
    if(storageError||!blob)return jsonError(404,"Image unavailable");
    return new Response(await blob.arrayBuffer(),{status:200,headers:{...headers,"Content-Type":"image/webp"}});
  }catch(_e){return jsonError(400,"Invalid request");}
});
