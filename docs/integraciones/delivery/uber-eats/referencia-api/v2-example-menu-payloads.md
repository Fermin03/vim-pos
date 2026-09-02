<!-- fuente: https://developer.uber.com/docs/eats/references/api/v2/example-menu-payloads -->
## Example Menu Payloads

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

Some example menu payloads for use with the v2 Menu API are listed below.

#### Empty Menu

This empty menu object can be used to clear a restaurant’s existing menu. However, we do not recommend clearing a menu before updating your menu with the put API. You can simply update the menu and all entities that do not exist in your new payload will be removed.

```
{
  "items": [],
  "modifier_groups": [],
  "categories": [],
  "menus": [{
        "id": "empty_menu_id",
        "title": {
          "translations": {
            "en_us": "Empty Menu"
          }
        },
        "service_availability": [
          {
            "day_of_week": "monday",
            "time_periods": [
              {"start_time": "00:00", "end_time": "23:59"}
            ]
          },
          {
            "day_of_week": "tuesday",
            "time_periods": [
              {"start_time": "00:00", "end_time": "23:59"}
            ]
          },
          {
            "day_of_week": "wednesday",
            "time_periods": [
              {"start_time": "00:00", "end_time": "23:59"}
            ]
          },
          {
            "day_of_week": "thursday",
            "time_periods": [
              {"start_time": "00:00", "end_time": "23:59"}
            ]
          },
          {
            "day_of_week": "friday",
            "time_periods": [
              {"start_time": "00:00", "end_time": "23:59"}
            ]
          },
          {
            "day_of_week": "saturday",
            "time_periods": [
              {"start_time": "00:00", "end_time": "23:59"}
            ]
          },
          {
            "day_of_week": "sunday",
            "time_periods": [
              {"start_time": "00:00", "end_time": "23:59"}
            ]
          }
        ],
        "category_ids": []
      }],
  "display_options": {}
}
```

#### Simple Example Menu

This is a simple menu structure that demonstrates the primary menu features.

```
{
  "items": [
    {
      "id": "Coffee",
      "description": {
        "translations": {
          "en_us": "Deliciously roasted beans"
        }
      },
      "title": {
        "translations": {
          "en_us": "Coffee"
        }
      },
      "quantity_info": {},
      "external_data": "External data for coffee",
      "modifier_group_ids": {
        "ids": [
          "Add-milk",
          "Add-sugar"
        ]
      },
      "price_info": {
        "price": 300
      },
      "tax_info": {
        "tax_rate": 8
      }
    },
    {
      "id": "Blueberry",
      "title": {
        "translations": {
          "en_us": "Blueberry"
        }
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-flavor",
            "quantity": {
              "max_permitted": 1
            }
          }
        ]
      },
      "external_data": "External data for blueberry flavor",
      "price_info": {
        "price": 5,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-flavor",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": 8
      }
    },
    {
      "id": "Muffin",
      "description": {
        "translations": {
          "en_us": "Great for afternoon snack time!"
        }
      },
      "title": {
        "translations": {
          "en_us": "Fresh-baked muffin"
        }
      },
      "external_data": "External data for muffin",
      "modifier_group_ids": {
        "ids": [
          "Choose-flavor"
        ]
      },
      "price_info": {
        "price": 300
      },
      "tax_info": {
        "tax_rate": 8
      }
    },
    {
      "id": "Sugar",
      "title": {
        "translations": {
          "en_us": "Sugar"
        }
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Add-sugar",
            "quantity": {
              "max_permitted": 2
            }
          }
        ]
      },
      "external_data": "External data for sugar",
      "price_info": {
        "price": 2,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Add-sugar",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": 8
      }
    },
    {
      "id": "Chocolate-deluxe",
      "title": {
        "translations": {
          "en_us": "Chocolate deluxe"
        }
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-flavor",
            "quantity": {
              "max_permitted": 1
            }
          }
        ]
      },
      "external_data": "External data for chocolate deluxe flavor",
      "price_info": {
        "price": 100,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-flavor",
            "price": 50
          }
        ]
      },
      "tax_info": {
        "tax_rate": 8
      },
    },
    {
      "id": "Milk",
      "title": {
        "translations": {
          "en_us": "Milk"
        }
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Add-milk",
            "quantity": {
              "max_permitted": 1
            }
          }
        ]
      },
      "external_data": "External data for milk",
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Add-milk",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": 8
      }
    },
    {
      "id": "Tea",
      "description": {
        "translations": {
          "en_us": "A soothing cuppa"
        }
      },
      "title": {
        "translations": {
          "en_us": "Tea"
        }
      },
      "quantity_info": {},
      "external_data": "External data for tea",
      "modifier_group_ids": {
        "ids": [
          "Add-milk",
          "Add-sugar"
        ]
      },
      "price_info": {
        "price": 250
      },
      "tax_info": {
        "tax_rate": 8
      }
    },
    {
      "id": "Chicken-sandwich",
      "description": {
        "translations": {
          "en_us": "Whole grain bread, grilled chicken and salad"
        }
      },
      "title": {
        "translations": {
          "en_us": "Chicken sandwich"
        }
      },
      "external_data": "External data for chicken sandwich",
      "price_info": {
        "price": 700
      },
      "tax_info": {
        "tax_rate": 8
      }
    }
  ],
  "display_options": {
    "disable_item_instructions": true
  },
  "menus": [
    {
      "service_availability": [
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "monday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "tuesday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "wednesday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "thursday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "friday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "saturday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "sunday"
        }
      ],
      "category_ids": [
        "Sandwiches",
        "Snacks",
        "Drinks"
      ],
      "id": "All-day",
      "title": {
        "translations": {
          "en_us": "All day"
        }
      }
    }
  ],
  "categories": [
    {
      "entities": [
        {
          "type": "ITEM",
          "id": "Muffin"
        }
      ],
      "id": "Snacks",
      "title": {
        "translations": {
          "en_us": "Snacks"
        }
      }
    },
    {
      "entities": [
        {
          "type": "ITEM",
          "id": "Chicken-sandwich"
        }
      ],
      "id": "Sandwiches",
      "title": {
        "translations": {
          "en_us": "Sandwiches"
        }
      }
    },
    {
      "entities": [
        {
          "type": "ITEM",
          "id": "Coffee"
        },
        {
          "type": "ITEM",
          "id": "Tea"
        }
      ],
      "id": "Drinks",
      "title": {
        "translations": {
          "en_us": "Drinks"
        }
      }
    }
  ],
  "modifier_groups": [
    {
      "quantity_info": {
        "quantity": {
          "max_permitted": 2
        }
      },
      "title": {
        "translations": {
          "en_us": "Add sugar"
        }
      },
      "external_data": "External data for sugar choice",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Sugar"
        }
      ],
      "display_type": null,
      "id": "Add-sugar"
    },
    {
      "quantity_info": {
        "quantity": {
          "max_permitted": 1,
          "min_permitted": 1
        }
      },
      "title": {
        "translations": {
          "en_us": "Choose flavor"
        }
      },
      "external_data": "External data for muffin flavor choice",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Blueberry"
        },
        {
          "type": "ITEM",
          "id": "Chocolate-deluxe"
        }
      ],
      "id": "Choose-flavor"
    },
    {
      "quantity_info": {
        "quantity": {
          "max_permitted": 1
        }
      },
      "title": {
        "translations": {
          "en_us": "Add milk"
        }
      },
      "external_data": "External data for milk choice",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Milk"
        }
      ],
      "id": "Add-milk"
    }
  ]
}
```

#### Six Level Deeply Nested Menu

This menu demonstrates the maximum allowable depth of nested items (six levels of modifier groups on a top-level item).

```
{
  "items": [
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "Soda"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-drink",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": null
      },
      "image_url": null,
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-drink",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Soda"
    },
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "Medium rare"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-cooking-time",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": [
          "Choose-cooking-metho"
        ]
      },
      "image_url": null,
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-cooking-time",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Medium-rare"
    },
    {
      "description": {
        "translations": {
          "en_us": "Burger and a drink!"
        }
      },
      "title": {
        "translations": {
          "en_us": "Burger combo"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": [
          "Choose-a-burger",
          "Choose-drink"
        ]
      },
      "image_url": null,
      "price_info": {
        "price": 1000,
        "overrides": []
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Burger-combo"
    },
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "Cheeseburger"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-a-burger",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": [
          "Choose-patty"
        ]
      },
      "image_url": null,
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-a-burger",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Cheeseburger"
    },
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "Sear for 10 seconds"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Additional-pan-sear",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": null
      },
      "image_url": null,
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Additional-pan-sear",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Sear-for-10-seconds"
    },
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "Sous vide"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-cooking-metho",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": [
          "Additional-pan-sear"
        ]
      },
      "image_url": null,
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-cooking-metho",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Sous-vide"
    },
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "Chicken burger"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-a-burger",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": null
      },
      "image_url": null,
      "price_info": {
        "price": 200,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-a-burger",
            "price": 200
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Chicken-burger"
    },
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "Veggie"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-patty",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": null
      },
      "image_url": null,
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-patty",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Veggie"
    },
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "Water"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-drink",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": null
      },
      "image_url": null,
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-drink",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Water"
    },
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "Ground"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-type-of-beef",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": null
      },
      "image_url": null,
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-type-of-beef",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Ground"
    },
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "Wagyu"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-type-of-beef",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": [
          "Choose-cooking-time"
        ]
      },
      "image_url": null,
      "price_info": {
        "price": 300,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-type-of-beef",
            "price": 300
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Wagyu"
    },
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "Well done"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-cooking-time",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": null
      },
      "image_url": null,
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-cooking-time",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Well-done"
    },
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "Grill"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-cooking-metho",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": null
      },
      "image_url": null,
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-cooking-metho",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Grill"
    },
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "Beef"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-patty",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": [
          "Choose-type-of-beef"
        ]
      },
      "image_url": null,
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-patty",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "Beef"
    },
    {
      "description": {
        "translations": {
          "en_us": ""
        }
      },
      "title": {
        "translations": {
          "en_us": "No sear"
        }
      },
      "nutritional_info": {
        "kilojoules": null,
        "calories": null
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Additional-pan-sear",
            "quantity": {
              "max_permitted": 1,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": null,
      "suspension_info": null,
      "modifier_group_ids": {
        "overrides": [],
        "ids": null
      },
      "image_url": null,
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Additional-pan-sear",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": null,
        "vat_rate_percentage": null
      },
      "id": "No-sear"
    }
  ],
  "display_options": {
    "disable_item_instructions": true
  },
  "menus": [
    {
      "service_availability": [
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "monday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "tuesday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "wednesday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "thursday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "friday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "saturday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "sunday"
        }
      ],
      "category_ids": [
        "Combo-meals"
      ],
      "id": "All-day",
      "title": {
        "translations": {
          "en_us": "All day"
        }
      }
    }
  ],
  "categories": [
    {
      "entities": [
        {
          "type": "ITEM",
          "id": "Burger-combo"
        }
      ],
      "id": "Combo-meals",
      "title": {
        "translations": {
          "en_us": "Combo meals"
        }
      }
    }
  ],
  "modifier_groups": [
    {
      "quantity_info": {
        "overrides": [],
        "quantity": {
          "max_permitted": 1,
          "min_permitted": 1,
          "default_quantity": null,
          "charge_above": null,
          "refund_under": null
        }
      },
      "title": {
        "translations": {
          "en_us": "Choose patty"
        }
      },
      "external_data": "",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Beef"
        },
        {
          "type": "ITEM",
          "id": "Veggie"
        }
      ],
      "display_type": null,
      "id": "Choose-patty"
    },
    {
      "quantity_info": {
        "overrides": [],
        "quantity": {
          "max_permitted": 1,
          "min_permitted": 1,
          "default_quantity": null,
          "charge_above": null,
          "refund_under": null
        }
      },
      "title": {
        "translations": {
          "en_us": "Additional pan sear"
        }
      },
      "external_data": "",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "No-sear"
        },
        {
          "type": "ITEM",
          "id": "Sear-for-10-seconds"
        }
      ],
      "display_type": null,
      "id": "Additional-pan-sear"
    },
    {
      "quantity_info": {
        "overrides": [],
        "quantity": {
          "max_permitted": 1,
          "min_permitted": 1,
          "default_quantity": null,
          "charge_above": null,
          "refund_under": null
        }
      },
      "title": {
        "translations": {
          "en_us": "Choose cooking method"
        }
      },
      "external_data": "",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Sous-vide"
        },
        {
          "type": "ITEM",
          "id": "Grill"
        }
      ],
      "display_type": null,
      "id": "Choose-cooking-metho"
    },
    {
      "quantity_info": {
        "overrides": [],
        "quantity": {
          "max_permitted": 1,
          "min_permitted": 1,
          "default_quantity": null,
          "charge_above": null,
          "refund_under": null
        }
      },
      "title": {
        "translations": {
          "en_us": "Choose a burger"
        }
      },
      "external_data": "",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Cheeseburger"
        },
        {
          "type": "ITEM",
          "id": "Chicken-burger"
        }
      ],
      "display_type": null,
      "id": "Choose-a-burger"
    },
    {
      "quantity_info": {
        "overrides": [],
        "quantity": {
          "max_permitted": 1,
          "min_permitted": 1,
          "default_quantity": null,
          "charge_above": null,
          "refund_under": null
        }
      },
      "title": {
        "translations": {
          "en_us": "Choose type of beef"
        }
      },
      "external_data": "",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Wagyu"
        },
        {
          "type": "ITEM",
          "id": "Ground"
        }
      ],
      "display_type": null,
      "id": "Choose-type-of-beef"
    },
    {
      "quantity_info": {
        "overrides": [],
        "quantity": {
          "max_permitted": 1,
          "min_permitted": 1,
          "default_quantity": null,
          "charge_above": null,
          "refund_under": null
        }
      },
      "title": {
        "translations": {
          "en_us": "Choose cooking time"
        }
      },
      "external_data": "",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Medium-rare"
        },
        {
          "type": "ITEM",
          "id": "Well-done"
        }
      ],
      "display_type": null,
      "id": "Choose-cooking-time"
    },
    {
      "quantity_info": {
        "overrides": [],
        "quantity": {
          "max_permitted": 1,
          "min_permitted": 1,
          "default_quantity": null,
          "charge_above": null,
          "refund_under": null
        }
      },
      "title": {
        "translations": {
          "en_us": "Choose drink"
        }
      },
      "external_data": "",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Soda"
        },
        {
          "type": "ITEM",
          "id": "Water"
        }
      ],
      "display_type": null,
      "id": "Choose-drink"
    }
  ]
}
```

#### Charge Above for an Item

This is an example of an individual item that has a charge\_above. Up to 2 barbeque sauces can be added free of charge, while additional sauces cost $1.00 each.

```
{
  "items": [
    {
      "title": {
        "translations": {
          "en_us": "Barbeque sauce"
        }
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-sauces",
            "quantity": {
              "max_permitted": 10,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": 2,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": "External data for barbeque sauce",
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-sauces",
            "price": 100
          }
        ]
      },
      "tax_info": {
        "tax_rate": 8,
        "vat_rate_percentage": null
      },
      "id": "Barbeque-sauce"
    }
  ]
}
```

#### Charge Above for a Modifier Group

This is an example of a modifier group that has a charge\_above. Up to 2 of any sauce in the group can be added free of charge, while additional sauces cost $1.00 each. Each item in a modifier group with a charge\_above must have the same price.

```
{
  "items": [
    {
      "title": {
        "translations": {
          "en_us": "Barbeque sauce"
        }
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-sauces",
            "quantity": {
              "max_permitted": 10,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": "External data for barbeque sauce",
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-sauces",
            "price": 100
          }
        ]
      },
      "tax_info": {
        "tax_rate": 8,
        "vat_rate_percentage": null
      },
      "id": "Barbeque-sauce"
    },
    {
      "title": {
        "translations": {
          "en_us": "Honey mustard sauce"
        }
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-sauces",
            "quantity": {
              "max_permitted": 10,
              "min_permitted": null,
              "default_quantity": null,
              "charge_above": null,
              "refund_under": null
            }
          }
        ],
        "quantity": {}
      },
      "external_data": "External data for honey mustard sauce",
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-sauces",
            "price": 100
          }
        ]
      },
      "tax_info": {
        "tax_rate": 8,
        "vat_rate_percentage": null
      },
      "id": "Honey-mustard-sauce"
    }
  ],
  "modifier_groups": [
    {
      "quantity_info": {
        "overrides": [],
        "quantity": {
          "max_permitted": null,
          "min_permitted": null,
          "default_quantity": null,
          "charge_above": 2,
          "refund_under": null
        }
      },
      "title": {
        "translations": {
          "en_us": "Choose sauces"
        }
      },
      "external_data": "External data for sauces choice",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Barbeque-sauce"
        },
        {
          "type": "ITEM",
          "id": "Honey-mustard-sauce"
        }
      ],
      "display_type": null,
      "id": "Choose-sauces"
    }
  ]
}
```

#### Add Tax Attributes

This is an example of a couple items with tax attributes.

-   The first is for pre-packaged unheated snacks.
-   The second is for heated food sold by weight/volume
-   The third is for cold beverages that contain 100% juice

```
[
  {
    "id":"item1",
    "title":{
       "translations":{
          "default":"first item"
       }
    },
    "price_info":{
       "price":1000
    },
    "modifier_group_ids":{
       "ids":[
          "mg1"
       ]
    },
    "tax_label_info": {
       "default_value": {
          "labels": ["CAT_PREPACKAGED_FOOD", "CAT_SNACK", "TEMP_UNHEATED"],
          "source": "MANUAL"
       }
    }
 },
 {
  "id":"item2",
  "title":{
     "translations":{
        "default":"second item"
     }
  },
  "price_info":{
     "price":2000
  },
  "modifier_group_ids":{
     "ids":[
        "mg2"
     ]
  },
  "tax_label_info": {
     "default_value": {
        "labels": ["CAT_FOOD_BY_WT_VOL", "TEMP_HEATED"],
        "source": "MANUAL"
     }
  }
 },
 {
   "id":"item3",
   "title":{
      "translations":{
         "default":"third item"
      }
   },
   "price_info":{
      "price":3000
   },
   "modifier_group_ids":{
      "ids":[
         "mg3"
      ]
   },
   "tax_label_info": {
      "default_value": {
         "labels": ["CAT_JUICE", "TRAIT_PCT_100", "TEMP_COLD"],
         "source": "MANUAL"
      }
   }
 }
]
```

### Hiding an Item

This is an example of an item that is only visible from 9AM to 1PM every day.

```
{
  "title": {
    "translations": {
      "en": "An Item"
    }
  },
  "description": {
    "translations": {
      "en": "The Description"
    }
  },
  "price_info": {
    "price": 1
  },
  "visibility_info": {
    "hours": [
      {
        "hours_of_week": [
          {
            "day_of_week": "monday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          },
          {
            "day_of_week": "tuesday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          },
          {
            "day_of_week": "wednesday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          },
          {
            "day_of_week": "thursday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          },
          {
            "day_of_week": "friday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          },
          {
            "day_of_week": "saturday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          },
          {
            "day_of_week": "sunday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### Hiding an Item for a month

This is an example of an item that is only visible from 9AM to 1PM every day from Jan 1st to Jan 30th.

```
{
  "title": {
    "translations": {
      "en": "An Item"
    }
  },
  "description": {
    "translations": {
      "en": "The Description"
    }
  },
  "price_info": {
    "price": 1
  },
  "visibility_info": {
    "start_date": "2020-01-01",
    "end_date": "2020-01-31",
    "hours": [
      {
        "hours_of_week": [
          {
            "day_of_week": "monday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          },
          {
            "day_of_week": "tuesday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          },
          {
            "day_of_week": "wednesday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          },
          {
            "day_of_week": "thursday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          },
          {
            "day_of_week": "friday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          },
          {
            "day_of_week": "saturday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          },
          {
            "day_of_week": "sunday",
            "time_periods": [
              {
                "start_time": "09:00",
                "end_time": "13:00"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

## Different Menus across Fulfillment Types

This is an example of menu that differs depending on menu type

```
{
  "menu_type": "MENU_TYPE_FULFILLMENT_DELIVERY",
  "menus": [
    {
      "id": "Special",
      "title": {
        "translations": {
          "en": "Specials"
        }
      },
      "service_availability": [
        {
          "day_of_week": "monday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "tuesday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "wednesday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "thursday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "friday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "saturday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "sunday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        }
      ],
      "category_ids": [
        "Specialed"
      ]
    }
  ],
  "categories": [
    {
      "id": "Specialed",
      "title": {
        "translations": {
          "en": "Specials"
        }
      },
      "entities": [
        {
          "id": "Best_Burgerz_Delivery"
        },
        {
          "id": "Best_Fries"
        },
      ]
    }
  ],
  "items": [
    {
      "id": "Best_Burger_Delivery",
      "title": {
        "translations": {
          "en": "Best Burger"
        }
      },
      "description": {
        "translations": {
          "en": "auce, habenero hot sauce, pickles and white bread"
        }
      },
      "price_info": {
        "price": 300,
        "overrides": []
      },
      "tax_info": {},
      "dish_info": {
        "classifications": {}
      },
      "tax_label_info": {
        "default_value": {
          "labels": [
            "TEMP_HEATED",
            "CAT_PREPARED_FOOD"
          ],
          "source": 1
        }
      }
    },
    {
      "id": "Best_Fries",
      "title": {
        "translations": {
          "en": "Best Fries"
        }
      },
      "description": {
        "translations": {
          "en": "auce, habenero hot sauce, pickles and white bread"
        }
      },
      "price_info": {
        "price": 100,
        "overrides": []
      },
      "tax_info": {},
      "dish_info": {
        "classifications": {}
      },
      "tax_label_info": {
        "default_value": {
          "labels": [
            "TEMP_HEATED",
            "CAT_PREPARED_FOOD"
          ],
          "source": 1
        }
      }
    }
  ],
  "modifier_groups": null,
  "display_options": {}
}
```
```
{
  "menu_type": "MENU_TYPE_FULFILLMENT_PICK_UP",
  "menus": [
    {
      "id": "Special",
      "title": {
        "translations": {
          "en": "Specials"
        }
      },
      "service_availability": [
        {
          "day_of_week": "monday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "tuesday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "wednesday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "thursday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "friday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "saturday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "sunday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        }
      ],
      "category_ids": [
        "Specialed"
      ]
    }
  ],
  "categories": [
    {
      "id": "Specialed",
      "title": {
        "translations": {
          "en": "Specials"
        }
      },
      "entities": [
        {
          "id": "Best_Burger_Pickup"
        },
        {
          "id": "Best_Fries"
        },
      ]
    }
  ],
  "items": [
    {
      "id": "Best_Burger_Pickup",
      "title": {
        "translations": {
          "en": "Best Burger With Pop"
        }
      },
      "description": {
        "translations": {
          "en": "auce, habenero hot sauce, pickles and white bread"
        }
      },
      "price_info": {
        "price": 900,
        "overrides": []
      },
      "tax_info": {},
      "dish_info": {
        "classifications": {}
      },
      "tax_label_info": {
        "default_value": {
          "labels": [
            "TEMP_HEATED",
            "CAT_PREPARED_FOOD"
          ],
          "source": 1
        }
      }
    },
    {
      "id": "Best_Fries",
      "title": {
        "translations": {
          "en": "Best Fries"
        }
      },
      "description": {
        "translations": {
          "en": "auce, habenero hot sauce, pickles and white bread"
        }
      },
      "price_info": {
        "price": 500,
        "overrides": []
      },
      "tax_info": {},
      "dish_info": {
        "classifications": {}
      },
      "tax_label_info": {
        "default_value": {
          "labels": [
            "TEMP_HEATED",
            "CAT_PREPARED_FOOD"
          ],
          "source": 1
        }
      }
    }
  ],
  "modifier_groups": null,
  "display_options": {}
}
```

## Sample items with dietary labels

This is an example of some items with dietary labels

```
“items”: [
  {
    "id": "item1",
    "title": {
      "translations": {
        "default": "first item"
      }
    },
    "price_info": {
      "price": 1000
    },
    "modifier_group_ids": {
      "ids": [
        "mg1"
      ]
    },
    "dish_info": {
      "classifications": {
        "dietary_label_info": {
          "labels": [
            "VEGETARIAN",
            "GLUTEN_FREE"
          ]
        }
      }
    }
  },
  {
    "id": "item2",
    "title": {
      "translations": {
        "default": "second item"
      }
    },
    "price_info": {
      "price": 2000
    },
    "modifier_group_ids": {
      "ids": [
        "mg2"
      ]
    },
    "dish_info": {
      "classifications": {
        "dietary_label_info": {
          "labels": [
            "VEGETARIAN",
            "VEGAN",
            "GLUTEN_FREE"
          ]
        }
      }
    }
  },
  {
    "id": "item3",
    "title": {
      "translations": {
        "default": "third item"
      }
    },
    "price_info": {
      "price": 3000
    },
    "modifier_group_ids": {
      "ids": [
        "mg3"
      ]
    },
    "dish_info": {
      "classifications": {
        "dietary_label_info": {
          "labels": []
        }
      }
    }
  }
]
```

## Sample item with product info

This is an example of some items with product info

```
“items”: [
  {
    "id": "item1",
    "title": {
      "translations": {
        "default": "first item"
      }
    },
    "price_info": {
      "price": 1000
    },
    "modifier_group_ids": {
      "ids": [
        "mg1"
      ]
    },
    "dish_info": {
      "classifications": {
        "dietary_label_info": {
          "labels": [
            "VEGETARIAN",
            "GLUTEN_FREE"
          ]
        }
      }
    },
    "product_info": {
      "target_market": "840",
      "gtin": "1354435445"
    }
  },
  {
    "id": "item2",
    "title": {
      "translations": {
        "default": "second item"
      }
    },
    "price_info": {
      "price": 2000
    },
    "modifier_group_ids": {
      "ids": [
        "mg2"
      ]
    },
    "dish_info": {
      "classifications": {
        "dietary_label_info": {
          "labels": [
            "VEGETARIAN",
            "VEGAN",
            "GLUTEN_FREE"
          ]
        }
      }
    },
    "product_info": {
      "plu": "9416"
    }
  },
  {
    "id": "item3",
    "title": {
      "translations": {
        "default": "third item"
      }
    },
    "price_info": {
      "price": 3000
    },
    "modifier_group_ids": {
      "ids": [
        "mg3"
      ]
    },
    "dish_info": {
      "classifications": {
        "dietary_label_info": {
          "labels": []
        }
      }
    },
    "product_info": {
      "merchant_id": "merchant-id-1234"
    }
  }
]
```

## Sample item with selling info

This is an example of some items with selling info

```
“items”: [
  {
    "id": "item1",
    "title": {
      "translations": {
        "default": "first item"
      }
    },
    "price_info": {
      "price": 1000,
      "priced_by_unit": {
        "measurement_type": "MEASUREMENT_TYPE_COUNT"
      }
    },
    "selling_info": [
      {
        "sold_by_unit": {
          "measurement_type": "MEASUREMENT_TYPE_WEIGHT",
          "weight_unit": "WEIGHT_UNIT_TYPE_METRIC_KILOGRAM"
        },
        "quantity_constraints": {
          "min_permitted": 1,
          "max_permitted": 10,
          "increment": 1,
          "default_quantity": 1
        },
        "priced_by_to_sold_by_unit_conversion_info": {
          "conversion_rate": 1
        }
      }
    ]
  },
  {
    "id": "item2",
    "title": {
      "translations": {
        "default": "second item"
      }
    },
    "price_info": {
      "price": 2000,
      "priced_by_unit": {
        "measurement_type": "MEASUREMENT_TYPE_WEIGHT",
        "weight_unit": "WEIGHT_UNIT_TYPE_METRIC_GRAM"
      }
    },
    "selling_info": [
      {
        "sold_by_unit": {
          "measurement_type": "MEASUREMENT_TYPE_WEIGHT",
          "weight_unit": "WEIGHT_UNIT_TYPE_METRIC_GRAM"
        },
        "quantity_constraints": {
          "min_permitted": 100,
          "max_permitted": 7000,
          "increment": 100,
          "default_quantity": 100
        }
      }
    ]
  }
]
```

## Sample modifier group with min/max\_permitted\_unique

This is an example of modifier group with min\_permitted\_unique and max\_permitted\_unique set

```
{
  "items": [
    {
      "id": "Coffee",
      "description": {
        "translations": {
          "en_us": "Deliciously roasted beans"
        }
      },
      "title": {
        "translations": {
          "en_us": "Coffee"
        }
      },
      "quantity_info": {},
      "external_data": "External data for coffee",
      "modifier_group_ids": {
        "ids": [
          "Add-milk",
          "Add-sugar"
        ]
      },
      "price_info": {
        "price": 300
      },
      "tax_info": {
        "tax_rate": 8
      }
    },
    {
      "id": "Blueberry",
      "title": {
        "translations": {
          "en_us": "Blueberry"
        }
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-flavor",
            "quantity": {
              "max_permitted": 5
            }
          }
        ]
      },
      "external_data": "External data for blueberry flavor",
      "price_info": {
        "price": 5,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-flavor",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": 8
      }
    },
    {
      "id": "Muffin",
      "description": {
        "translations": {
          "en_us": "Great for afternoon snack time!"
        }
      },
      "title": {
        "translations": {
          "en_us": "Fresh-baked muffin"
        }
      },
      "external_data": "External data for muffin",
      "modifier_group_ids": {
        "ids": [
          "Choose-flavor"
        ]
      },
      "price_info": {
        "price": 300
      },
      "tax_info": {
        "tax_rate": 8
      }
    },
    {
      "id": "Sugar",
      "title": {
        "translations": {
          "en_us": "Sugar"
        }
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Add-sugar",
            "quantity": {
              "max_permitted": 2
            }
          }
        ]
      },
      "external_data": "External data for sugar",
      "price_info": {
        "price": 2,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Add-sugar",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": 8
      }
    },
    {
      "id": "Chocolate-deluxe",
      "title": {
        "translations": {
          "en_us": "Chocolate deluxe"
        }
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-flavor",
            "quantity": {
              "max_permitted": 5
            }
          }
        ]
      },
      "external_data": "External data for chocolate deluxe flavor",
      "price_info": {
        "price": 100,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Choose-flavor",
            "price": 50
          }
        ]
      },
      "tax_info": {
        "tax_rate": 8
      },
    },
    {
      "id": "Milk",
      "title": {
        "translations": {
          "en_us": "Milk"
        }
      },
      "quantity_info": {
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Add-milk",
            "quantity": {
              "max_permitted": 1
            }
          }
        ]
      },
      "external_data": "External data for milk",
      "price_info": {
        "price": 0,
        "overrides": [
          {
            "context_type": "MODIFIER_GROUP",
            "context_value": "Add-milk",
            "price": 0
          }
        ]
      },
      "tax_info": {
        "tax_rate": 8
      }
    },
    {
      "id": "Tea",
      "description": {
        "translations": {
          "en_us": "A soothing cuppa"
        }
      },
      "title": {
        "translations": {
          "en_us": "Tea"
        }
      },
      "quantity_info": {},
      "external_data": "External data for tea",
      "modifier_group_ids": {
        "ids": [
          "Add-milk",
          "Add-sugar"
        ]
      },
      "price_info": {
        "price": 250
      },
      "tax_info": {
        "tax_rate": 8
      }
    },
    {
      "id": "Chicken-sandwich",
      "description": {
        "translations": {
          "en_us": "Whole grain bread, grilled chicken and salad"
        }
      },
      "title": {
        "translations": {
          "en_us": "Chicken sandwich"
        }
      },
      "external_data": "External data for chicken sandwich",
      "price_info": {
        "price": 700
      },
      "tax_info": {
        "tax_rate": 8
      }
    }
  ],
  "display_options": {
    "disable_item_instructions": true
  },
  "menus": [
    {
      "service_availability": [
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "monday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "tuesday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "wednesday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "thursday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "friday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "saturday"
        },
        {
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ],
          "day_of_week": "sunday"
        }
      ],
      "category_ids": [
        "Sandwiches",
        "Snacks",
        "Drinks"
      ],
      "id": "All-day",
      "title": {
        "translations": {
          "en_us": "All day"
        }
      }
    }
  ],
  "categories": [
    {
      "entities": [
        {
          "type": "ITEM",
          "id": "Muffin"
        }
      ],
      "id": "Snacks",
      "title": {
        "translations": {
          "en_us": "Snacks"
        }
      }
    },
    {
      "entities": [
        {
          "type": "ITEM",
          "id": "Chicken-sandwich"
        }
      ],
      "id": "Sandwiches",
      "title": {
        "translations": {
          "en_us": "Sandwiches"
        }
      }
    },
    {
      "entities": [
        {
          "type": "ITEM",
          "id": "Coffee"
        },
        {
          "type": "ITEM",
          "id": "Tea"
        }
      ],
      "id": "Drinks",
      "title": {
        "translations": {
          "en_us": "Drinks"
        }
      }
    }
  ],
  "modifier_groups": [
    {
      "quantity_info": {
        "quantity": {
          "max_permitted": 2
        }
      },
      "title": {
        "translations": {
          "en_us": "Add sugar"
        }
      },
      "external_data": "External data for sugar choice",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Sugar"
        }
      ],
      "display_type": null,
      "id": "Add-sugar"
    },
    {
      "quantity_info": {
        "quantity": {
          "min_permitted_unique": 1,
          "max_permitted_unique": 1,
          "max_permitted": 5
        }
      },
      "title": {
        "translations": {
          "en_us": "Choose flavor"
        }
      },
      "external_data": "External data for muffin flavor choice",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Blueberry"
        },
        {
          "type": "ITEM",
          "id": "Chocolate-deluxe"
        }
      ],
      "id": "Choose-flavor"
    },
    {
      "quantity_info": {
        "quantity": {
          "max_permitted": 1
        }
      },
      "title": {
        "translations": {
          "en_us": "Add milk"
        }
      },
      "external_data": "External data for milk choice",
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Milk"
        }
      ],
      "id": "Add-milk"
    }
  ]
}
```
```
{
  "menu_type": "MENU_TYPE_FULFILLMENT_DINE_IN",
  "menus": [
    {
      "id": "Special",
      "title": {
        "translations": {
          "en": "Specials"
        }
      },
      "service_availability": [
        {
          "day_of_week": "monday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "tuesday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "wednesday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "thursday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "friday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "saturday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "sunday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        }
      ],
      "category_ids": [
        "Specialed"
      ]
    }
  ],
  "categories": [
    {
      "id": "Specialed",
      "title": {
        "translations": {
          "en": "Specials"
        }
      },
      "entities": [
        {
          "id": "Best_Burger_Pickup"
        },
        {
          "id": "Best_Fries"
        },
      ]
    }
  ],
  "items": [
    {
      "id": "Best_Burger_Pickup",
      "title": {
        "translations": {
          "en": "Best Burger With Pop"
        }
      },
      "description": {
        "translations": {
          "en": "auce, habenero hot sauce, pickles and white bread"
        }
      },
      "price_info": {
        "price": 900,
        "overrides": []
      },
      "tax_info": {},
      "dish_info": {
        "classifications": {}
      },
      "tax_label_info": {
        "default_value": {
          "labels": [
            "TEMP_HEATED",
            "CAT_PREPARED_FOOD"
          ],
          "source": 1
        }
      }
    },
    {
      "id": "Best_Fries",
      "title": {
        "translations": {
          "en": "Best Fries"
        }
      },
      "description": {
        "translations": {
          "en": "auce, habenero hot sauce, pickles and white bread"
        }
      },
      "price_info": {
        "price": 500,
        "overrides": []
      },
      "tax_info": {},
      "dish_info": {
        "classifications": {}
      },
      "tax_label_info": {
        "default_value": {
          "labels": [
            "TEMP_HEATED",
            "CAT_PREPARED_FOOD"
          ],
          "source": 1
        }
      }
    }
  ],
  "modifier_groups": null,
  "display_options": {}
}
```

## Sample combo item with bundled\_items and core\_price

The below example has Best Burger Combo that contains a drink that is customizable and fries that are bundled.

```
{
  "menus": [
    {
      "id": "Menu",
      "title": {
        "translations": {
          "en": "Menu"
        }
      },
      "service_availability": [
        {
          "day_of_week": "monday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "tuesday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "wednesday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "thursday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "friday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "saturday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "sunday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        }
      ],
      "category_ids": [
        "Mains"
      ]
    }
  ],
  "categories": [
    {
      "id": "Mains",
      "title": {
        "translations": {
          "en": "Mains"
        }
      },
      "entities": [
        {
          "id": "Burger_Combo"
        },
        {
          "id": "Best_Fries"
        }
      ]
    }
  ],
  "items": [
    {
      "id": "Burger_Combo",
      "title": {
        "translations": {
          "en": "Best Burger Combo"
        }
      },
      "description": {
        "translations": {
          "en": "Burger with fries and a drink, literally the best"
        }
      },
      "price_info": {
        "price": 900,
        "overrides": []
      },
      "modifier_group_ids": {
        "ids": [
          "Select-Drink"
        ]
      },
      "bundled_items": [
        {
          "item_id": "Best_Fries",
          "core_price": 300,
          "included_quantity": 1
        }
      ]
    },
    {
      "id": "Best_Fries",
      "title": {
        "translations": {
          "en": "Best Fries"
        }
      },
      "description": {
        "translations": {
          "en": "Literally the best fries"
        }
      },
      "price_info": {
        "price": 300,
        "overrides": []
      }
    },
    {
      "id": "Root_Beer",
      "title": {
        "translations": {
          "en": "Root Beer"
        }
      },
      "price_info": {
        "price": 0,
        "corePrice": 200,
        "overrides": []
      }
    },
    {
      "id": "Ginger_Ale",
      "title": {
        "translations": {
          "en": "Ginger Ale"
        }
      },
      "price_info": {
        "price": 0,
        "corePrice": 200,
        "overrides": []
      }
    }
  ],
  "modifier_groups": [
    {
      "quantity_info": {
        "quantity": {
          "max_permitted": 1
        }
      },
      "title": {
        "translations": {
          "en_us": "Select Drink"
        }
      },
      "modifier_options": [
        {
          "type": "ITEM",
          "id": "Root_Beer"
        },
        {
          "type": "ITEM",
          "id": "Ginger_Ale"
        }
      ],
      "display_type": null,
      "id": "Select-Drink"
    }
  ],
  "display_options": {}
}
```

## Sample menu with item set with UPT and attributes

```
{
"menus": [
    {
      "id": "Menu",
      "title": {
        "translations": {
          "en": "Menu"
        }
      },
      "service_availability": [
        {
          "day_of_week": "monday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "tuesday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "wednesday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "thursday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "friday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "saturday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        },
        {
          "day_of_week": "sunday",
          "time_periods": [
            {
              "start_time": "00:00",
              "end_time": "23:59"
            }
          ]
        }
      ],
      "category_ids": [
        "Mains"
      ]
    }
  ],
  "categories": [
    {
      "id": "Mains",
      "title": {
        "translations": {
          "en": "Mains"
        }
      },
      "entities": [
        {
          "id": "Best_Fries"
        }
      ]
    }
  ],
  "items": [
    {
      "id": "Best_Fries",
      "title": {
        "translations": {
          "en": "Best Fries"
        }
      },
      "description": {
        "translations": {
          "en": "Literally the best baked fries. Spiked with booze"
        }
      },
      "price_info": {
        "price": 300,
        "overrides": [],
        "container_deposit": 100
      },
      "tax_info": {},
      "dish_info": {
        "classifications": {
          "instructions_for_use": "Consume ASAP",
          "ingredients": [
            "fries",
            "booze"
          ],
          "additives": [
            "additives"
          ],
          "preparation_type": "PREPACKAGED",
          "food_business_operator": {
            "name": "fbo_name",
            "address": "fbo_address"
          }
        }
      },
      "beverage_info": {
        "caffeine_amount": 10,
        "alcohol_by_volume": 1000,
        "coffee_info": {
          "coffee_bean_origin": [
            "US"
          ]
        }
      },
      "physical_properties_info": {
        "reusable_packaging": true,
        "storage_instructions": "storage_instructions"
      },
      "medication_info": {
        "medical_prescription_required": true
      },
      "tax_label_info": {
        "default_value": {
          "labels": [
            "TEMP_HEATED",
            "CAT_PREPARED_FOOD"
          ],
          "source": "DEFAULT"
        }
      },
      "product_info": {
        "product_type": "FOOD_BAKERY",
        "product_traits": [
          "CONTAINS_ALCOHOL"
        ],
        "countries_of_origin": [
          "US",
          "Canada"
        ]
      },
      "nutritional_info": {
        "allergens": [
          "allergens"
        ],
        "calories": {
          "upper_range": 100,
          "lower_range": 100,
          "display_type": "single_item"
        },
        "calories_per_serving": {
          "energy_interval": {
            "lower": 10000000,
            "upper": 10000000
          },
          "display_type": "single_item"
        },
        "kilojoules": {
          "upper_range": 100,
          "lower_range": 100,
          "display_type": "single_item"
        },
        "kilojoules_per_serving": {
          "energy_interval": {
            "lower": 10000000,
            "upper": 10000000
          },
          "display_type": "single_item"
        },
        "number_of_servings_interval": {
          "lower": 100000,
          "upper": 100000
        },
        "net_quantity": {
          "measurement_type": "MEASUREMENT_TYPE_WEIGHT",
          "weight_interval": {
            "interval": {
              "lower": 100000,
              "upper": 100000
            },
            "weight": {
              "unit_type": "WEIGHT_UNIT_TYPE_METRIC_GRAM"
            }
          }
        },
        "serving_size": {
          "measurement_type": "MEASUREMENT_TYPE_WEIGHT",
          "weight_interval": {
            "interval": {
              "lower": 100000,
              "upper": 100000
            },
            "weight": {
              "unit_type": "WEIGHT_UNIT_TYPE_METRIC_GRAM"
            }
          }
        },
        "fat": {
          "amount": {
            "interval": {
              "lower": 100000,
              "upper": 100000
            },
            "weight": {
              "unit_type": "WEIGHT_UNIT_TYPE_METRIC_GRAM"
            }
          }
        },
        "saturated_fatty_acids": {
          "amount": {
            "interval": {
              "lower": 100000,
              "upper": 100000
            },
            "weight": {
              "unit_type": "WEIGHT_UNIT_TYPE_METRIC_GRAM"
            }
          }
        },
        "carbohydrates": {
          "amount": {
            "interval": {
              "lower": 100000,
              "upper": 100000
            },
            "weight": {
              "unit_type": "WEIGHT_UNIT_TYPE_METRIC_GRAM"
            }
          }
        },
        "sugar": {
          "amount": {
            "interval": {
              "lower": 100000,
              "upper": 100000
            },
            "weight": {
              "unit_type": "WEIGHT_UNIT_TYPE_METRIC_GRAM"
            }
          }
        },
        "protein": {
          "amount": {
            "interval": {
              "lower": 110000,
              "upper": 110000
            },
            "weight": {
              "unit_type": "WEIGHT_UNIT_TYPE_IMPERIAL_POUND"
            }
          }
        },
        "salt": {
          "amount": {
            "interval": {
              "lower": 100000,
              "upper": 100000
            },
            "weight": {
              "unit_type": "WEIGHT_UNIT_TYPE_METRIC_GRAM"
            }
          }
        }
      }
    }
  ],
  "modifier_groups": [],
  "display_options": {}
}
```

[

Empty Menu

](#empty-menu)[

Simple Example Menu

](#simple-example-menu)[

Six Level Deeply Nested Menu

](#six-level-deeply-nested-menu)[

Charge Above for an Item

](#charge-above-for-an-item)[

Charge Above for a Modifier Group

](#charge-above-for-a-modifier-group)[

Add Tax Attributes

](#add-tax-attributes)[

Hiding an Item

](#hiding-an-item)[

Hiding an Item for a month

](#hiding-an-item-for-a-month)[

Different Menus across Fulfillment Types

](#different-menus-across-fulfillment-types)[

Sample items with dietary labels

](#sample-items-with-dietary-labels)[

Sample item with product info

](#sample-item-with-product-info)[

Sample item with selling info

](#sample-item-with-selling-info)[

Sample modifier group with min/max\_permitted\_unique

](#sample-modifier-group-with-min/max_permitted_unique)[

Sample combo item with bundled\_items and core\_price

](#sample-combo-item-with-bundled_items-and-core_price)[

Sample menu with item set with UPT and attributes

](#sample-menu-with-item-set-with-upt-and-attributes)
