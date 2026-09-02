
# Obsolescencias

## Cabeceras de obsolescencia

Cuando se realicen cambios en la API se enviará a través de las respuestas HTTP y peticiones en weboohoks dos cabeceras indicando que se harán cambios.

- `x-rappi-api-deprecation-date`: Cabecera HTTP indicando la fecha en la que se realizará el cambio.

- `x-rappi-api-deprecation-info`: Cabecera HTTP indicando la URL donde se encontrará más información respecto al cambio.

## Cambios asociados a totales y descuentos

A partir del 1 de Noviembre de 2022 se cambiará la manera en la que se muestran totales y descuentos en la orden.
<br/>
<br/>
Se retirarán los campos relacionados a descuentos en los items y subitems, adicionalmente el precio de los items y subitems se verá reflejado sin descuento en un nuevo campo `price`.

<pre>
<code>
{
  "order_id",
  ...,
  "items": [
    {
      "id",
      "sku",
      "name",
      "type",
      "comments",
      "price",
      "unit_price_with_discount", // Obsoleto
      "unit_price_without_discount", // Obsoleto
      "percentage_discount", // Obsoleto
      "quantity",
      "subitems": [
        {
          "id",
          "sku",
          "name",
          "type",
          "comments",
          "price",
          "unit_price_with_discount", // Obsoleto
          "unit_price_without_discount", // Obsoleto
          "percentage_discount", // Obsoleto
          "quantity",
          "subitems"
        }
      ]
    }
  ]
}
</code>
</pre>

La información asociada a descuentos se encontrará en la orden, en un campo `discounts` que cuenta con una lista de todos los descuentos asociados.

<pre>
<code>
{
  "order_id",
  ...,
  "discounts": [
    {
      "value",
      "description",
      "title",
      "product_id",
      "sku",
      "type",
      "raw_value",
      "value_type",
      "max_value",
      "includes_toppings",
      "percentage_by_rappi",
      "percentage_by_partners",
      "amount_by_rappi",
      "amount_by_partner",
      "discount_product_units",
      "discount_product_unit_value"
    }
  ]
}
</code>
</pre>

De la información asociada a totales se retirarán los campos enfocados a descuentos a pro de un único campo `total_discounts` y se añadirá un campo `discount_by_support`.

<pre>
<code>
{
  "order_id",
  ...,
  "totals": {
    "total_products",
    "total_discounts",
    "total_products_with_discount", // Obsoleto
    "total_products_without_discount", // Obsoleto
    "total_other_discounts", // Obsoleto
    "total_order",
    "total_to_pay",
    "discount_by_support",
    "charges": {
      "shipping",
      "service_fee"
    },
    "other_totals": {
      "tip",
      "total_rappi_pay",
      "total_rappi_credits"
    }
  }
}
</code>
</pre>

Puedes encontrar más información sobre los campos totales y descuentos [acá](/es/managing-user-orders#total-de-ordenes-y-descuentos)
