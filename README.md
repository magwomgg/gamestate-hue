# gamestate

_**NOTE: Archived because API has changed**_


## Usage

gamestate_integration_magwom.cfg:

``` cfg
"MAGWOM Integration v1.0"
{
"uri" "https://gamestate.magwom.gg/hook"
"timeout" "5.0"
"buffer"  "0.1"
"throttle" "0.5"
"heartbeat" "10.0"
"data"
{
   "provider"            "1"
   "map"                 "1"
   "round"               "1"
   "player_id"           "1"
   "player_state"        "1"
   "player_weapons"      "1"
   "player_match_stats"  "1"
}
}
```
