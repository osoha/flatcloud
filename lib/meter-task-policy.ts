import {businessDateKey} from "./calendar";
export function meterNeedsReading(last:Date|null,createdAt:Date,now:Date){const from=Date.parse(`${businessDateKey(last||createdAt)}T00:00:00Z`),to=Date.parse(`${businessDateKey(now)}T00:00:00Z`);return (to-from)/86400000>90;}
export function annualReadingWindow(now:Date){return businessDateKey(now).slice(5)>="12-01";}
