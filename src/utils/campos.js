/* ───── Configuración global de campos ───── */

/* ❶ Nunca se mostrarán */
export const OMIT_FIELDS = [
  'geom', 'the_geom', 'bbox',
  'shape_leng', 'shape_area',
  'tipo_de_co', 'tipo_de_zo',
  'gravable',                  // 🚫 fuera del popup / dashboard
  'url',                       // 🚫 fuera del popup / dashboard
  'descuento_', 'descuento1', 'descuent_1'
];

/* ❷ Etiqueta + formato para los campos habilitables */
export const FIELD_LABELS = {
  cve_cat     : { txt:'Clave catastral',      fmt:'numero' },
  estatus_    : { txt:'Estatus',              fmt:'texto'  },
  clasificad  : { txt:'C. Terreno',           fmt:'texto'  },
  clasific_1  : { txt:'C. Construccion',      fmt:'texto'  },
  valor_de_c  : { txt:'Costo construcción',   fmt:'moneda' },
  valor_del_  : { txt:'Costo terreno',        fmt:'moneda' },
  colonia_    : { txt:'Colonia',              fmt:'texto'  },
  nombre_del  : { txt:'Propietario',          fmt:'texto'  },
  domicilio_  : { txt:'Domicilio',            fmt:'texto'  },
  ubicación   : { txt:'Ubicación',            fmt:'texto'  },
  adeudo_des  : { txt:'Adeudo desde',         fmt:'fecha'  },
  adeudo_has  : { txt:'Adeudo hasta',         fmt:'fecha'  },
  terreno_m2  : { txt:'Terreno (m²)',         fmt:'area'   },
  construcci  : { txt:'Construcción (m²)',    fmt:'area'   },
  valor_cata  : { txt:'Valor catastral',      fmt:'moneda' },
  impuesto_   : { txt:'Impuesto',             fmt:'moneda' },
  subtotal_   : { txt:'Subtotal',             fmt:'moneda' },
  total_a_pa  : { txt:'Total a pagar',        fmt:'moneda' }
};

/* ❸ Lista que verá el super‑admin */
export const ENABLED_FIELDS = Object.keys(FIELD_LABELS);
