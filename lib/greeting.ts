/** Explicit known vocatives; unknown names, titles and companies get a neutral greeting. */
const vocatives: Record<string,string> = { Ondřej:"Ondřeji",Jan:"Jane",Petr:"Petře",Pavel:"Pavle",Martin:"Martine",Tomáš:"Tomáši",Jiří:"Jiří",Josef:"Josefe",David:"Davide",Michal:"Michale",Jakub:"Jakube",Marek:"Marku",Karel:"Karle",Anna:"Anno",Jana:"Jano",Eva:"Evo",Marie:"Marie",Petra:"Petro",Lucie:"Lucie",Kateřina:"Kateřino",Lenka:"Lenko",Alena:"Aleno",Veronika:"Veroniko",Simona:"Simono" };
export function greeting(name:string,person=true) {
  const first=name.trim().split(/\s+/)[0];
  return person&&vocatives[first] ? `Dobrý den, ${vocatives[first]}!` : "Dobrý den!";
}
