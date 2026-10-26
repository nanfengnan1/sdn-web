// getRandomValues is available on isolated HTTP lab origins where randomUUID is not.
export function newRequestID(source: Pick<Crypto, 'getRandomValues'> = crypto): string {
  const bytes=source.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function explicitRejection(status: number | undefined) { return status !== undefined && [400,401,403,404,409,410,422,429].includes(status); }
export function coalesceAsync(run: () => Promise<void>, delay=250) {
  let timer: ReturnType<typeof setTimeout> | undefined; let running=false; let dirty=false; let stopped=false;
  const trigger=()=>{if(stopped)return;dirty=true;if(timer||running)return;timer=setTimeout(async()=>{timer=undefined;dirty=false;running=true;try{await run();}finally{running=false;if(dirty&&!stopped)trigger();}},delay);};
  return { trigger, stop(){stopped=true;dirty=false;if(timer)clearTimeout(timer);} };
}
