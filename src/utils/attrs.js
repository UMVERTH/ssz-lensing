/* ────────────────────────────────────────────────────────────────
   attrs.js – mapeos y formateadores (igual a Leaflet)
──────────────────────────────────────────────────────────────── */
export const ATTR_MAP = {
  clave_cat : 'Clave Catastral:',
  cve_cat   : 'Clave Catastral.:',
  estatus_  : 'Estatus:',
  gravable  : 'Gravable:',
  observacio: 'Observaciones:',
  tipo_de_co: 'Tipo de Construcción:',
  clasificad: 'Clasificación:',
  valor_de_c: 'Valor de Construcción:',
  tipo_de_zo: 'T_Zona:',
  clasific_1: 'Clasificación:',
  valor_del_: 'Valor del Terreno:',
  colonia_  : 'Colonia:',
  nombre_del: 'Propietario:',
  domicilio_: 'Domicilio:',
  'ubicación': 'Ubicación del Predio',
  zona_     : 'Zona:',
  adeudo_des: 'Adeudo desde:',
  adeudo_has: 'Adeudo hasta:',
  terreno_m2: 'Terreno en m2:',
  construcci: 'Construcción m2:',
  valor_cata: 'Valor Catastral:',
  impuesto_ : 'Impuesto:',
  descuento_: 'Desc. Pensionado:',
  descuento1: 'Desc. Pronto Pago:',
  subtotal_ : 'Subtotal:',
  descuent_1: 'Descuento:',
  total_a_pa: 'Total a Pagar:',
  url       : 'Expediente:'
};

export const CURRENCY_FIELDS = [
  'valor_de_c','valor_del_', 'valor_cata', 'impuesto_', 'descuento_', 
  'descuento1', 'subtotal_', 'descuent_1', 'total_a_pa'
];

export const DATE_FIELDS = ['adeudo_des', 'adeudo_has'];

export const EXCLUDE_FIELDS = [
  'lot_cat','shape_leng','shape_area','obs','xxx','xxxx','columna_a_excluir3','geom','the_geom','id'
];

export const friendly = (k)=> ATTR_MAP[k] || k;

export function fmtCurrency(v){
  const num = Number(v);
  if(isNaN(num)) return v;
  return new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' }).format(num);
}

export function fmtDate(v){
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString('es-MX',{year:'numeric',month:'2-digit',day:'2-digit'});
}
