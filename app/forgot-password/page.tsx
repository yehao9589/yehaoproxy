import ForgotPasswordClient from "./ForgotPasswordClient";

type SearchParams=Promise<Record<string,string|string[]|undefined>>;

export default async function ForgotPasswordPage({searchParams}:{searchParams:SearchParams}){
 const query=await searchParams;
 return <ForgotPasswordClient
  firstSetup={query.setup==="1"}
  initialEmail={typeof query.email==="string"?query.email:""}
  previewSuccess={query.preview==="success"}
 />;
}
