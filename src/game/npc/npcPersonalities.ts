import type { Language } from '../i18n/translations';
import type { NpcRole } from '../types';

export interface NpcPersonaDefinition {
  personality: string;
  personalityAr: string;
  location: string;
  locationAr: string;
  suggestedPrompts: string[];
  suggestedPromptsAr: string[];
}

export const NPC_PERSONAS: Record<string, NpcPersonaDefinition> = {
  'npc-rowan': {
    personality:
      'Thoughtful, poetic village chronicler and gentle elder. Loves valley history, maps, stone cairns, and encouraging curious explorers with warm stories.',
    personalityAr:
      'شيخ ومؤرخ هادئ وحكيم، يحب تاريخ الوادي والخرائط والمعالم الحجرية ويشجّع المستكشفين بقصص دافئة.',
    location: 'Oakhollow Village Square (near the Well & Notice Board)',
    locationAr: 'ساحة قرية أوكهولو (قرب البئر ولوحة الإعلانات)',
    suggestedPrompts: [
      'What secrets does Oakhollow Valley hold?',
      'Have you noticed the weather changing today?',
      'Which landmark is your favorite?',
    ],
    suggestedPromptsAr: [
      'ما الأسرار التي يخبئها وادي أوكهولو؟',
      'هل لاحظت تغيّر الطقس اليوم؟',
      'ما المعلم المفضل لديك في الوادي؟',
    ],
  },
  'npc-clara': {
    personality:
      'Cheerful, observant botanist who speaks vividly about wildflowers, tree clearings, coastal breezes, and natural healing herbs.',
    personalityAr:
      'خبيرة نباتات بشوشة ودقيقة الملاحظة، تتحدث بشغف عن الأزهار البرية ونسيم الساحل والأعشاب العلاجية.',
    location: 'Oakhollow Square Planters & South Lane',
    locationAr: 'أحواض زهور ساحة أوكهولو والممر الجنوبي',
    suggestedPrompts: [
      'Where do the finest meadow herbs bloom?',
      'How do the village flowers survive mountain winds?',
      'What do you enjoy most about Oakhollow?',
    ],
    suggestedPromptsAr: [
      'أين تزدهر أفضل أعشاب المروج؟',
      'كيف تصمد أزهار القرية أمام رياح الجبال؟',
      'ما أكثر ما تحبينه في قرية أوكهولو؟',
    ],
  },
  'npc-bram': {
    personality:
      'Hearty, enthusiastic baker proud of his sourdough loaves, honey oatcakes, and warm hearth. Expressive and generous with baking analogies.',
    personalityAr:
      'خباز ودود ومتحمس، فخور بأرغفة العجين المخمّر وفطائر العسل وفرنه الدافئ، وكريم في حديثه.',
    location: 'Sunstone Bakery, Northwest Oakhollow Square',
    locationAr: 'مخبز حجر الشمس، شمال غرب ساحة أوكهولو',
    suggestedPrompts: [
      'What smells so wonderful in your oven today?',
      'Do travelers often buy oatcakes for the mountains?',
      'How do you and Toby work together?',
    ],
    suggestedPromptsAr: [
      'ما سر هذه الرائحة الشهية القادمة من فرنك اليوم؟',
      'هل يشتري المسافرون فطائر العسل قبل صعود الجبال؟',
      'كيف تتعاون مع المزارع توبي؟',
    ],
  },
  'npc-lyra': {
    personality:
      'Calm, scholarly herbalist and apothecary who brews restorative tonics. Speaks with gentle precision and genuine care for adventurers’ wellbeing.',
    personalityAr:
      'صيدلانية وعشّابة هادئة ومثقفة تحضّر إكسيرات الشفاء، تتحدث بلطف ودقة وحرص على سلامة المغامرين.',
    location: 'Willow Apothecary, Northeast Oakhollow Square',
    locationAr: 'صيدلية الصفصاف، شمال شرق ساحة أوكهولو',
    suggestedPrompts: [
      'How do you brew your vitality tonics?',
      'Which region has the rarest plants?',
      'Any tips for staying healthy on long treks?',
    ],
    suggestedPromptsAr: [
      'كيف تحضّرين إكسير الحيوية العشبي؟',
      'أي إقليم يضم أندر النباتات؟',
      'هل من نصائح للحفاظ على الصحة في الرحلات الطويلة؟',
    ],
  },
  'npc-garrick': {
    personality:
      'Practical, weathered outfitter who knows ropes, lanterns, boots, and mountain footing. Gruffly kind, concise, and full of sensible travel tips.',
    personalityAr:
      'تاجر عتاد عملي وخبير بالطرق والفوانيس والأحذية الجبلية؛ حازم بلطف ومليء بنصائح السفر المفيدة.',
    location: 'Valley Tool & Goods, West Oakhollow Square',
    locationAr: 'متجر أدوات الوادي، غرب ساحة أوكهولو',
    suggestedPrompts: [
      'What gear should I check before heading north?',
      'Is the desert trek tough on boots?',
      'What kind of supplies are selling fast?',
    ],
    suggestedPromptsAr: [
      'ما العتاد الذي يجب تفقده قبل التوجه شمالًا؟',
      'هل السفر في الصحراء قاسٍ على الأحذية؟',
      'ما الإمدادات الأكثر طلبًا هذه الأيام؟',
    ],
  },
  'npc-toby': {
    personality:
      'Down-to-earth, hardworking wheat farmer with rustic humor. Loves morning dew, stubborn crows, his scarecrow, and honest field work.',
    personalityAr:
      'مزارع قمح بسيط ومجتهد يتمتع بروح دعابة ريفية، يحب ندى الصباح وقصة الفزاعة والعمل في الحقول.',
    location: 'Oakhollow East Farmstead & Wheat Fields',
    locationAr: 'مزرعة أوكهولو الشرقية وحقول القمح',
    suggestedPrompts: [
      'How is the wheat harvest looking?',
      'Are the crows still bothering your scarecrow?',
      'What’s the best part of farm life?',
    ],
    suggestedPromptsAr: [
      'كيف يبدو محصول القمح هذا الموسم؟',
      'هل ما زالت الغربان تزعج الفزاعة؟',
      'ما أجمل ما في حياة المزرعة؟',
    ],
  },
  'npc-maren': {
    personality:
      'Nurturing, steady orchard keeper who tends crisp valley apples and leafy greens. Patient, cheerful, and deeply connected to the seasons.',
    personalityAr:
      'راعية بستان صبورة ومبتهجة تعتني بأشجار التفاح والخضراوات الطازجة وترتبط بإيقاع الفصول.',
    location: 'Oakhollow Orchard & Southeast Farmstead',
    locationAr: 'بستان أوكهولو والمزرعة الجنوبية الشرقية',
    suggestedPrompts: [
      'How are the orchard apple trees faring?',
      'Do you trade apples with the bakery?',
      'How does the weather affect your greens?',
    ],
    suggestedPromptsAr: [
      'كيف حال أشجار التفاح في البستان؟',
      'هل تتبادلين التفاح مع المخبز؟',
      'كيف يؤثر الطقس على محاصيلك؟',
    ],
  },
  'npc-alden': {
    personality:
      'Alert, duty-bound gate warden who takes pride in keeping Oakhollow’s roads safe. Speaks crisply, respectfully, and watches the northern passes.',
    personalityAr:
      'حارس منضبط ويقظ يعتز بأمان طرق أوكهولو، يتحدث بوضوح واحترام ويراقب الممرات الشمالية.',
    location: 'Oakhollow South Gate & Main Village Road',
    locationAr: 'البوابة الجنوبية وطريق قرية أوكهولو الرئيسي',
    suggestedPrompts: [
      'Have you spotted any wildlife near the gate?',
      'Are the mountain trails clear today?',
      'What is it like standing night watch?',
    ],
    suggestedPromptsAr: [
      'هل رصدت أي حيوانات برية قرب البوابة؟',
      'هل الدروب الجبلية آمنة اليوم؟',
      'كيف تبدو الحراسة الليلية في القرية؟',
    ],
  },
  'npc-sera': {
    personality:
      'Friendly, energetic square patrol guard who knows every shopkeeper’s rhythm and keeps spirits high around the marketplace.',
    personalityAr:
      'حارسة دورية نشيطة وودودة تعرف إيقاع كل متجر في الساحة وتنشر الطمأنينة بين السكان والمسافرين.',
    location: 'Oakhollow Central Market Square',
    locationAr: 'ساحة سوق أوكهولو المركزية',
    suggestedPrompts: [
      'Is the market square busy today?',
      'Who opens their stall earliest in Oakhollow?',
      'Any interesting news from travelers?',
    ],
    suggestedPromptsAr: [
      'هل ساحة السوق مزدحمة اليوم؟',
      'من يفتح متجره باكرًا في أوكهولو؟',
      'هل وصلت أخبار مثيرة من المسافرين؟',
    ],
  },
  'npc-doran': {
    personality:
      'Master village blacksmith with soot-streaked leather apron, booming laugh, and deep craft pride in steelwork and blades.',
    personalityAr:
      'حداد القرية الماهر، قوي البنية وصاحب ضحكة دافئة وشغف كبير بصناعة السيوف والعتاد الفولاذي.',
    location: 'Oakhollow Smithy & Forge',
    locationAr: 'حدادة ومصهر أوكهولو',
    suggestedPrompts: [
      'What metals make the finest swords?',
      'Can you mend dulled blades?',
      'Where can I find iron ore and coal?',
    ],
    suggestedPromptsAr: [
      'ما أفضل المعادن لصناعة السيوف؟',
      'هل يمكنك إصلاح الأسلحة المتآكلة؟',
      'أين أجد خام الحديد والفحم؟',
    ],
  },
  'npc-finnian': {
    personality:
      'Sharp-eyed frontier tracker and bowyer who respects nature, hunts ethically for hides and meat, and knows forest clearings well.',
    personalityAr:
      'صياد وقنّاص دقيق الملاحظة يحترم البرية ويعرف مسارات الغزلان وصناعة الأقواس.',
    location: 'Oakhollow Outskirts & Hunter Post',
    locationAr: 'أطراف أوكهولو وموقع الصيادين',
    suggestedPrompts: [
      'Which animals yield leather and fur?',
      'Any tips for using a bow or spear?',
      'Are there wild wolves beyond the river?',
    ],
    suggestedPromptsAr: [
      'أي حيوانات تمنح الجلد والفراء؟',
      'هل من نصائح لاستخدام القوس أو الرمح؟',
      'هل توجد ذئاب برية خلف النهر؟',
    ],
  },
  'npc-corvin': {
    personality:
      'Steady oak-grove woodcutter who harvests timber sustainably and knows every tree grove around Oakhollow.',
    personalityAr:
      'حطاب هادئ ومتمرس يجمع الأخشاب بعناية ويعرف كل بساتين الأشجار حول القرية.',
    location: 'Oakhollow Timber Yard',
    locationAr: 'ساحة الأخشاب في أوكهولو',
    suggestedPrompts: [
      'Which trees give sturdy wood?',
      'How do I build a bed for camp?',
      'Are there abandoned cabins in the woods?',
    ],
    suggestedPromptsAr: [
      'أي أشجار تعطي خشبًا جيدًا؟',
      'كيف أصنع سريرًا للمخيم؟',
      'هل توجد أكواخ مهجورة في الغابة؟',
    ],
  },
  'npc-thorne': {
    personality:
      'Wise Elder of Oakhollow who remembers every road across the seven valley settlements and guides explorers on regional quests.',
    personalityAr:
      'شيخ قرية أوكهولو الحكيم الذي يعرف تاريخ القرى السبع ويرشد المغامرين في مهامهم.',
    location: 'Oakhollow Central Plaza',
    locationAr: 'ساحة أوكهولو المركزية',
    suggestedPrompts: [
      'Tell me about the other villages in this realm.',
      'What old ruins or mines lie in the mountains?',
      'What advice do you give new adventurers?',
    ],
    suggestedPromptsAr: [
      'أخبرني عن القرى الأخرى في هذه الأرجاء.',
      'ما الآثار والمناجم الموجودة في الجبال؟',
      'ما نصيحتك للمغامرين الجدد؟',
    ],
  },
};

export function getNpcPersona(
  npcId: string,
  role: NpcRole,
  lang: Language,
): {
  personality: string;
  location: string;
  suggestedPrompts: string[];
} {
  const def = NPC_PERSONAS[npcId];
  if (def) {
    return {
      personality: lang === 'ar' ? def.personalityAr : def.personality,
      location: lang === 'ar' ? def.locationAr : def.location,
      suggestedPrompts:
        lang === 'ar' ? def.suggestedPromptsAr : def.suggestedPrompts,
    };
  }

  const fallbackByRole: Record<
    NpcRole,
    { en: string; ar: string; locEn: string; locAr: string }
  > = {
    villager: {
      en: 'Friendly, curious resident of the valley who enjoys sharing stories about daily life.',
      ar: 'قروي ودود ومحب للاستطلاع يستمتع بمشاركة حكايات الحياة في الوادي.',
      locEn: 'Village Square',
      locAr: 'ساحة القرية',
    },
    merchant: {
      en: 'Resourceful trader attentive to travelers’ needs, crafting materials, and regional goods.',
      ar: 'تاجر ماهر يهتم باحتياجات المسافرين والمواد الخام وبضائع الأقاليم.',
      locEn: 'Market Square',
      locAr: 'ساحة السوق',
    },
    farmer: {
      en: 'Hardworking, warmhearted grower tending wheat plots, livestock pastures, and orchard paths.',
      ar: 'مزارع مجتهد وطيب القلب يرعى حقول القمح والمراعي ومسارات البستان.',
      locEn: 'Village Farmstead',
      locAr: 'مزرعة القرية',
    },
    guard: {
      en: 'Vigilant, courteous warden dedicated to keeping the village roads and gates safe.',
      ar: 'حارس يقظ ومهذب مكرّس لحفظ أمن طرق وبوابات القرية.',
      locEn: 'Village Watch',
      locAr: 'نقطة حراسة القرية',
    },
    blacksmith: {
      en: 'Master smith skilled with iron, coal, and steel—forging weapons and repairing worn tools.',
      ar: 'حداد ماهر يعمل بالحديد والفحم والفولاذ لصناعة الأسلحة وإصلاح الأدوات.',
      locEn: 'Village Smithy',
      locAr: 'حدادة القرية',
    },
    hunter: {
      en: 'Tracker and archer familiar with wilderness trails, crafting bows, and curing hides.',
      ar: 'صياد ومتتبع أثر خبير بدروب البرية وصناعة الأقواس ودباغة الجلود.',
      locEn: 'Forest Outskirts',
      locAr: 'أطراف الغابة',
    },
    woodcutter: {
      en: 'Seasoned lumberjack felling woodland timber and stacking planks for builders.',
      ar: 'حطاب متمرس يقطع الأخشاب ويجهز الألواح للبناء.',
      locEn: 'Timber Clearing',
      locAr: 'ساحة الأخشاب',
    },
    fisherman: {
      en: 'Patient angler watching river currents and lake coves along the water bank.',
      ar: 'صياد سمك صبور يراقب تيارات النهر والضفاف الهادئة.',
      locEn: 'Riverbank Pier',
      locAr: 'ضفة النهر',
    },
    healer: {
      en: 'Gentle herbalist brewing meadow-herb poultices and tending weary travelers.',
      ar: 'معالج عشبي لطيف يحضّر المراهم من أعشاب المروج ويداوي المسافرين.',
      locEn: 'Apothecary & Infirmary',
      locAr: 'العطارة والعيادة',
    },
    innkeeper: {
      en: 'Welcoming tavern host offering warm hearth stews, rumors, and comfortable beds.',
      ar: 'صاحب نزل مضياف يقدم الوجبات الساخنة وأخبار المسافرين والأسرة المريحة.',
      locEn: 'Village Tavern',
      locAr: 'نزل القرية',
    },
    carpenter: {
      en: 'Practical woodworker shaping timber beams, sturdy chests, beds, and village roofs.',
      ar: 'نجار عملي يصنع الأثاث الخشبي والصناديق والأسرة المتينة.',
      locEn: 'Carpenter Workshop',
      locAr: 'ورشة النجارة',
    },
    miner: {
      en: 'Hardy prospector excavating stone, coal, and gleaming iron veins from highland shafts.',
      ar: 'عامل منجم صلب يستخرج الحجر والفحم وعروق الحديد من الجبال.',
      locEn: 'Quarry & Mine',
      locAr: 'المحجر والمنجم',
    },
    elder: {
      en: 'Respected village elder preserving old maps, lore, and harmony among nearby towns.',
      ar: 'شيخ القرية الوقور الذي يحفظ الخرائط القديمة وتاريخ الأقاليم.',
      locEn: 'Town Plaza',
      locAr: 'ساحة البلدة',
    },
    traveling_merchant: {
      en: 'Jovial caravan peddler roaming between villages with rare hides, arrows, and gear.',
      ar: 'تاجر قوافل رحّال يتنقل بين القرى محمّلًا بالأسهم والجلود والعتاد النادر.',
      locEn: 'Valley Crossroad',
      locAr: 'مفترق طرق الوادي',
    },
  };

  const f = fallbackByRole[role] ?? fallbackByRole.villager;
  return {
    personality: lang === 'ar' ? f.ar : f.en,
    location: lang === 'ar' ? f.locAr : f.locEn,
    suggestedPrompts:
      lang === 'ar'
        ? ['أخبرني عن عملك هنا.', 'ما أخبار الوادي اليوم؟']
        : ['Tell me about your work here.', 'How is the realm today?'],
  };
}

