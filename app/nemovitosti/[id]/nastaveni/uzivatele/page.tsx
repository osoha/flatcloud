import PropertyPage from "../../[section]/page";
export const dynamic = "force-dynamic";
export default function PropertyUsersPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string;invite?:string}>}) {
  return PropertyPage({params:params.then(({id})=>({id,section:"uzivatele"})),searchParams});
}
