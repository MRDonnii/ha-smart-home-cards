# HA Pet Nutrition Card

Food, portions per meal, weight and goal for a dog on an automatic feeder. The card works out the calories per day,
compares them with a recommendation and shows a feeding table by weight. Same premium look as `ha-pet-care-card`.

```yaml
type: custom:ha-pet-nutrition-card
name: Buddy
food: input_select.dog_food              # options = the foods
food_kcal:                               # kcal per 100 g for each option (or "(386)" in the option text)
  Puppy Original: 386
  Adult Chicken: 382
portions: input_number.feeder_portions   # portions per meal – your feeder plan should follow this helper
portion_weight: number.feeder_portion_weight   # entity or grams, default 6
meals: [input_boolean.meal_morning, input_boolean.meal_noon, input_boolean.meal_evening]  # or meals_count: 3
weight: input_number.dog_weight          # kg; 5 or less counts as "not weighed yet"
goal_weight: input_number.dog_goal_weight
goal: input_select.dog_food_goal         # options containing "Tabe sig"/"lose", "Holde"/"keep", "Aktiv"/"active"
birthday: input_datetime.dog_birthday    # date only
container: input_number.feeder_container_grams
```

Optional: `title`, `adult_from_months` (12), `history_days` (90), `table_from`/`table_to`/`table_step` (20/36/2),
`food_kcal_entity` (fallback kcal sensor).

Recommendation: RER = 70 × kg^0.75. Lose = 1.2 × RER of the goal weight, keep = 1.4 × RER, active = 1.6 × RER.
It is a rule of thumb – the scales decide.
