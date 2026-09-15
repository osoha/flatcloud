import { fileStorageCapabilities } from "@/lib/storage";
type Props={propertyId:string;unitId?:string;leaseId?:string;taskId?:string;taskEntryId?:string;complianceRecordId?:string;propertyCostId?:string;returnTo:string;category?:string;photoStage?:string;categories?:[string,string][];title?:string};
export function DocumentUploadForm(props:Props){if(!fileStorageCapabilities().upload)return <div className="document-storage-disabled"><strong>Úložiště dokumentů zatím není nakonfigurováno.</strong><span>Existující dokumenty lze prohlížet, nové nelze nahrávat.</span></div>;return <form className="compact-form document-upload" action="/api/documents/upload" method="post" encType="multipart/form-data">
  {(["propertyId","unitId","leaseId","taskId","taskEntryId","complianceRecordId","propertyCostId","returnTo","photoStage"] as const).map(k=>props[k]?<input key={k} type="hidden" name={k} value={props[k]}/>:null)}
  <label className="field"><span>Název</span><input name="title" defaultValue={props.title}/></label>
  {props.categories?<label className="field"><span>Kategorie</span><select name="category" defaultValue={props.category||props.categories[0]?.[0]}>{props.categories.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>:props.category?<input type="hidden" name="category" value={props.category}/>:null}
  <label className="field field-full"><span>Soubory (max. 10, 25 MB každý)</span><input name="files" type="file" multiple required/></label>
  <button className="primary" type="submit">Nahrát přílohy</button>
</form>}
