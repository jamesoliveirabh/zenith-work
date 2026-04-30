import {
  Users, Code2, Palette, Megaphone, DollarSign, Headphones, ShoppingCart,
  Briefcase, Wrench, Truck, Factory, Scale, GraduationCap, Stethoscope,
  Camera, PenTool, BarChart3, Building2, Cpu, Database, Cloud, Shield,
  Rocket, Lightbulb, HeartHandshake, Package, Globe, BookOpen, Mail,
  Phone, Hammer, FlaskConical, Music, Film, Gamepad2, Plane, Car,
  Utensils, Coffee, Leaf, Activity, type LucideIcon,
} from "lucide-react";

const RULES: Array<[RegExp, LucideIcon]> = [
  [/\b(dev|engineer|engenharia|tech|tecnologia|ti|software|program|cod)/i, Code2],
  [/\b(design|ux|ui|criativ|cria[cç][aã]o)/i, Palette],
  [/\b(market|mkt|growth|divulg|publicidade|m[ií]dia)/i, Megaphone],
  [/\b(vend|sales|comercial|business|bd)/i, ShoppingCart],
  [/\b(financ|finance|cont[aá]bil|contabilidade|tesour|fiscal)/i, DollarSign],
  [/\b(suporte|support|atendimento|help|sac|cs|customer)/i, Headphones],
  [/\b(rh|hr|gente|pessoas|people|recursos humanos|talent)/i, HeartHandshake],
  [/\b(juridic|jur[ií]dico|legal|advoca|compliance)/i, Scale],
  [/\b(log[ií]stic|entrega|frete|transport|delivery)/i, Truck],
  [/\b(produ[cç][aã]o|manufatur|fabrica|industri|f[aá]brica)/i, Factory],
  [/\b(produto|product|pm|po)/i, Package],
  [/\b(qa|qualidade|teste|quality)/i, Shield],
  [/\b(dados|data|analytic|bi|insight)/i, BarChart3],
  [/\b(banco de dados|database|db)/i, Database],
  [/\b(devops|infra|cloud|sre|sistema)/i, Cloud],
  [/\b(seguran[cç]a|security|secops|infosec)/i, Shield],
  [/\b(ia|ai|ml|machine|inteligencia artificial|cpu|hardware)/i, Cpu],
  [/\b(opera[cç][oõ]es|opera[cç][aã]o|operations|ops)/i, Briefcase],
  [/\b(executiv|diret|board|c-?level|ceo|cto|cfo)/i, Building2],
  [/\b(inova[cç][aã]o|innovation|labs?|pesquisa|research|p&d|r&d)/i, Lightbulb],
  [/\b(launch|lan[cç]amento|startup)/i, Rocket],
  [/\b(educa[cç][aã]o|education|treinamento|training|ensino|escola|academy)/i, GraduationCap],
  [/\b(sa[uú]de|health|m[eé]dic|cl[ií]nic|hospital)/i, Stethoscope],
  [/\b(foto|photo|camera|imagem)/i, Camera],
  [/\b(conte[uú]do|content|redacao|reda[cç][aã]o|copy|escrit)/i, PenTool],
  [/\b(manuten[cç][aã]o|maintenance|reparo|t[eé]cnico)/i, Wrench],
  [/\b(constru[cç][aã]o|obra|civil|engenharia civil)/i, Hammer],
  [/\b(lab|laborat[oó]rio|qu[ií]mic|biolog)/i, FlaskConical],
  [/\b(m[uú]sic|som|audio|[aá]udio)/i, Music],
  [/\b(v[ií]deo|filme|cinema|stream)/i, Film],
  [/\b(jogo|game|gaming)/i, Gamepad2],
  [/\b(viagem|travel|turismo|aviation|aero)/i, Plane],
  [/\b(automotiv|carro|veicul|motor)/i, Car],
  [/\b(restaurante|food|alimenta[cç][aã]o|cozinha|chef)/i, Utensils],
  [/\b(caf[eé]|coffee|barista)/i, Coffee],
  [/\b(sustentab|verde|eco|ambiental|green)/i, Leaf],
  [/\b(global|internacional|international|web|site)/i, Globe],
  [/\b(biblioteca|book|livro|edit[oô]ra|publish)/i, BookOpen],
  [/\b(email|e-mail|comunica[cç][aã]o|comms?)/i, Mail],
  [/\b(call|telefon|voice|telecom)/i, Phone],
  [/\b(performance|fitness|esporte|sport|atleta)/i, Activity],
];

export function getTeamIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Users;
  for (const [regex, Icon] of RULES) {
    if (regex.test(name)) return Icon;
  }
  return Users;
}
