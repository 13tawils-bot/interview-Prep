// Exercise library for the workout tracker. Each base movement expands into
// one exercise per equipment variant, e.g. "Bench Press (Barbell)".
(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.EXERCISES = data;
})(typeof self !== "undefined" ? self : this, function () {
  const EQUIP = {
    B: "Barbell", D: "Dumbbell", M: "Machine", C: "Cable", S: "Smith Machine", K: "Kettlebell",
    E: "EZ Bar", T: "Trap Bar", R: "Band", W: "Bodyweight", P: "Plate", A: "Assisted", X: "Weighted", L: "Landmine",
  };
  // Types: wr weight × reps, bw bodyweight reps (extra kg optional), as assisted (kg of help),
  // du duration, cd cardio distance + duration.
  const TYPE_FOR = { W: "bw", A: "as", X: "bw" };
  // "Name|primary|secondary,secondary|equipment codes|type (optional)"
  const rows = `
Bench Press|chest|triceps,shoulders|B,D,S,M
Incline Bench Press|chest|shoulders,triceps|B,D,S,M
Decline Bench Press|chest|triceps|B,D,S,M
Close-Grip Bench Press|triceps|chest,shoulders|B,S,D
Floor Press|chest|triceps|B,D
Chest Press|chest|triceps,shoulders|M,C,R
Incline Chest Press|chest|shoulders|M
Chest Fly|chest|shoulders|D,C,M
Incline Chest Fly|chest|shoulders|D,C
Low-to-High Cable Fly|chest|shoulders|C
High-to-Low Cable Fly|chest|shoulders|C
Pec Deck|chest||M
Push Up|chest|triceps,shoulders|W,X
Incline Push Up|chest|triceps|W
Decline Push Up|chest|shoulders,triceps|W
Diamond Push Up|triceps|chest|W
Chest Dip|chest|triceps,shoulders|W,X,A
Pullover|chest|lats|D,C
Svend Press|chest||P
Overhead Press|shoulders|triceps|B,D,S,M,K
Seated Overhead Press|shoulders|triceps|B,D
Arnold Press|shoulders|triceps|D
Push Press|shoulders|triceps,quads|B,D,K
Shoulder Press|shoulders|triceps|M,R
Lateral Raise|shoulders||D,C,M,R
Seated Lateral Raise|shoulders||D
Lean-In Lateral Raise|shoulders||C,D
Front Raise|shoulders||D,C,B,P,R
Rear Delt Fly|shoulders|upper back|D,C,M
Reverse Pec Deck|shoulders|upper back|M
Face Pull|shoulders|upper back|C,R
Upright Row|shoulders|traps|B,D,C,E
Y Raise|shoulders|upper back|D,C
Landmine Press|shoulders|chest,triceps|L
Handstand Push Up|shoulders|triceps|W
Pike Push Up|shoulders|triceps|W
Cuban Press|shoulders||D
Shrug|traps||B,D,T,S,M,C
Deadlift|lower back|hamstrings,glutes,traps|B,T,D,K
Sumo Deadlift|glutes|quads,hamstrings,lower back|B,K
Romanian Deadlift|hamstrings|glutes,lower back|B,D,S,K
Stiff-Leg Deadlift|hamstrings|glutes,lower back|B,D
Single-Leg Romanian Deadlift|hamstrings|glutes|D,K,W
Good Morning|hamstrings|lower back,glutes|B,S
Rack Pull|lower back|traps,glutes|B
Deficit Deadlift|lower back|hamstrings,glutes|B
Back Extension|lower back|glutes,hamstrings|W,X,M
Reverse Hyperextension|glutes|lower back,hamstrings|M,W
Superman|lower back||W
Pull Up|lats|biceps,upper back|W,X,A,R
Chin Up|lats|biceps|W,X,A
Neutral-Grip Pull Up|lats|biceps|W,X
Lat Pulldown|lats|biceps|C,M,R
Close-Grip Lat Pulldown|lats|biceps|C
Single-Arm Lat Pulldown|lats|biceps|C
Straight-Arm Pulldown|lats||C,R
Bent Over Row|upper back|lats,biceps|B,D,S
Pendlay Row|upper back|lats|B
Single-Arm Row|lats|upper back,biceps|D,C,K
Chest-Supported Row|upper back|lats,biceps|D,M
Seal Row|upper back|lats|B,D
T-Bar Row|upper back|lats,biceps|B,M,L
Seated Cable Row|upper back|lats,biceps|C
Wide-Grip Seated Row|upper back|shoulders|C
Seated Row|upper back|lats|M,R
Inverted Row|upper back|lats,biceps|W
Meadows Row|lats|upper back|L
Renegade Row|upper back|abs|D,K
Bicep Curl|biceps|forearms|B,D,C,E,R,M
Hammer Curl|biceps|forearms|D,C,R
Incline Curl|biceps||D
Preacher Curl|biceps||B,D,E,M
Concentration Curl|biceps||D
Spider Curl|biceps||D,E
Bayesian Curl|biceps||C
Cross-Body Hammer Curl|biceps|forearms|D
Reverse Curl|forearms|biceps|B,E,D,C
Drag Curl|biceps||B
21s Curl|biceps||B,E
Zottman Curl|biceps|forearms|D
Chin Up Hold|biceps|lats|W|du
Triceps Pushdown|triceps||C,R
Rope Pushdown|triceps||C
Single-Arm Pushdown|triceps||C
Overhead Triceps Extension|triceps||D,C,E,R
Skull Crusher|triceps||E,B,D
Triceps Kickback|triceps||D,C
Triceps Dip|triceps|chest,shoulders|W,X,A,M
Bench Dip|triceps||W,X
JM Press|triceps|chest|B,S
Tate Press|triceps||D
Wrist Curl|forearms||B,D,C
Reverse Wrist Curl|forearms||B,D
Farmer's Walk|forearms|traps,abs|D,K,T|du
Dead Hang|forearms|lats|W|du
Plate Pinch|forearms||P|du
Squat|quads|glutes,hamstrings|B,S,D,K
Front Squat|quads|glutes,abs|B,D,K
Goblet Squat|quads|glutes|D,K
Box Squat|quads|glutes|B
Pause Squat|quads|glutes|B
Hack Squat|quads|glutes|M,B
Pendulum Squat|quads|glutes|M
Belt Squat|quads|glutes|M
Leg Press|quads|glutes,hamstrings|M
Single-Leg Leg Press|quads|glutes|M
Bodyweight Squat|quads|glutes|W
Jump Squat|quads|glutes,calves|W,D
Pistol Squat|quads|glutes|W,A
Sissy Squat|quads||W,M
Leg Extension|quads||M,R
Lunge|quads|glutes|B,D,K,W,S
Reverse Lunge|quads|glutes|B,D,W,S
Walking Lunge|quads|glutes|D,B,W
Bulgarian Split Squat|quads|glutes|D,B,S,W
Split Squat|quads|glutes|D,B,S,W
Step Up|quads|glutes|D,B,W
Lateral Lunge|adductors|quads,glutes|D,W,K
Curtsy Lunge|glutes|quads|D,W
Leg Curl|hamstrings||M
Seated Leg Curl|hamstrings||M
Lying Leg Curl|hamstrings||M
Nordic Hamstring Curl|hamstrings||W,A
Glute-Ham Raise|hamstrings|glutes|W,X
Hip Thrust|glutes|hamstrings|B,D,S,M,W
Single-Leg Hip Thrust|glutes|hamstrings|W,D
Glute Bridge|glutes|hamstrings|B,D,W
Cable Pull Through|glutes|hamstrings|C
Glute Kickback|glutes||C,M,W,R
Hip Abduction|abductors|glutes|M,C,R
Hip Adduction|adductors||M,C
Frog Pump|glutes||W,D
Kettlebell Swing|glutes|hamstrings,lower back|K,D
Standing Calf Raise|calves||M,S,D,B,W
Seated Calf Raise|calves||M,D,B
Calf Press|calves||M
Single-Leg Calf Raise|calves||D,W
Tibialis Raise|calves||W,P
Crunch|abs||W,C,M,X
Sit Up|abs||W,X
Decline Sit Up|abs||W,X
Hanging Leg Raise|abs|forearms|W,X
Hanging Knee Raise|abs||W
Lying Leg Raise|abs||W
Captain's Chair Leg Raise|abs||W
Toes to Bar|abs|lats|W
Ab Wheel Rollout|abs||W
Cable Crunch|abs||C
Reverse Crunch|abs||W
Bicycle Crunch|abs|obliques|W
V Up|abs||W
Dead Bug|abs||W
Hollow Body Hold|abs||W|du
Plank|abs||W,X|du
Side Plank|obliques|abs|W|du
Russian Twist|obliques|abs|W,D,P,K
Cable Woodchop|obliques|abs|C
Pallof Press|obliques|abs|C,R
Side Bend|obliques||D,C,K
Landmine Rotation|obliques|abs|L
Mountain Climber|abs|shoulders|W|du
L-Sit|abs||W|du
Dragon Flag|abs||W
Clean|full body|quads,traps|B,D,K
Power Clean|full body|quads,traps|B
Hang Clean|full body|traps|B,K
Clean and Jerk|full body|shoulders,quads|B
Snatch|full body|shoulders,quads|B,D,K
Thruster|full body|quads,shoulders|B,D,K
Turkish Get Up|full body|shoulders,abs|K,D
Burpee|full body||W
Man Maker|full body||D
Wall Ball|full body|quads,shoulders|P
Sled Push|full body|quads|M|du
Sled Pull|full body|hamstrings|M|du
Battle Ropes|full body|shoulders|W|du
Box Jump|quads|glutes,calves|W
Broad Jump|quads|glutes|W
Jump Rope|cardio|calves|W|du
Running|cardio||W|cd
Treadmill|cardio||M|cd
Incline Treadmill Walk|cardio|calves|M|cd
Cycling|cardio|quads|W|cd
Stationary Bike|cardio|quads|M|cd
Rowing Machine|cardio|upper back,quads|M|cd
Elliptical|cardio||M|cd
Stair Climber|cardio|glutes,quads|M|cd
Ski Erg|cardio|lats,triceps|M|cd
Assault Bike|cardio||M|cd
Swimming|cardio|lats|W|cd
Walking|cardio||W|cd
Hiking|cardio|quads,glutes|W|cd
Neck Curl|neck||P,W
Neck Extension|neck||P,W
Shoulder Dislocate|shoulders||R
Band Pull Apart|upper back|shoulders|R
Scapular Pull Up|upper back|lats|W
`.trim().split("\n");
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const out = [];
  for (const row of rows) {
    const [base, primary, secondary, equip, type] = row.split("|");
    const codes = equip.split(",");
    for (const code of codes) {
      const name = code === "W" ? base : `${base} (${EQUIP[code]})`;
      out.push({
        id: "x-" + slug(name), name, primary, secondary: secondary ? secondary.split(",") : [],
        equipment: EQUIP[code], type: type || TYPE_FOR[code] || "wr",
      });
    }
  }
  return out;
});
