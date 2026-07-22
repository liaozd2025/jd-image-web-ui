import type { Locale, TranslationDictionary } from "./i18n/types";

type ModelCopy = {
  label: string;
  none: string;
  unavailable: string;
  mode: string;
  references: string;
  over: string;
  overDetail: string;
  size: string;
  format: string;
  calls: string;
  optimization: string;
  off: string;
  standard: string;
  fast: string;
  random: string;
  fixed: string;
  seedHint: string;
  seedInvalid: string;
  defaultSelected: string;
  firstSelected: string;
  fallbackSelected: string;
  adjusted: string;
  defaultLabel: string;
  saveFailed: string;
  legacy: string;
  changedTitle: string;
  changedMessage: string;
  changedDetail: string;
  retry: string;
};

function dictionary(copy: ModelCopy): TranslationDictionary {
  return {
    "generationModel.label": copy.label,
    "generationModel.none": copy.none,
    "generationModel.profileUnavailable": copy.unavailable,
    "generationModel.modeUnsupported": copy.mode,
    "generationModel.tooManyReferences": copy.references,
    "generationModel.referenceOverLimit": copy.over,
    "generationModel.referenceOverLimitDetail": copy.overDetail,
    "generationModel.sizeUnsupported": copy.size,
    "generationModel.formatUnsupported": copy.format,
    "generationModel.independentCalls": copy.calls,
    "generationModel.promptOptimization": copy.optimization,
    "generationModel.promptOptimizationOff": copy.off,
    "generationModel.promptOptimizationStandard": copy.standard,
    "generationModel.promptOptimizationFast": copy.fast,
    "generationModel.seed": "Seed",
    "generationModel.seedRandom": copy.random,
    "generationModel.seedFixed": copy.fixed,
    "generationModel.seedHint": copy.seedHint,
    "generationModel.seedInvalid": copy.seedInvalid,
    "generationModel.defaultSelected": copy.defaultSelected,
    "generationModel.firstAvailableSelected": copy.firstSelected,
    "generationModel.savedUnavailableSelected": copy.fallbackSelected,
    "generationModel.parametersAdjusted": copy.adjusted,
    "generationModel.default": copy.defaultLabel,
    "generationModel.preferenceSaveFailed": copy.saveFailed,
    "generationModel.legacyCompatibility": copy.legacy,
    "taskActions.capabilityChangedTitle": copy.changedTitle,
    "taskActions.capabilityChangedMessage": copy.changedMessage,
    "taskActions.capabilityChangedDetail": copy.changedDetail,
    "taskActions.retryWithCurrentCapability": copy.retry,
  };
}

export const GENERATION_MODEL_TRANSLATIONS: Partial<Record<Locale, TranslationDictionary>> = {
  "zh-TW": dictionary({
    label: "生圖模型", none: "尚未設定生圖模型，請前往系統設定新增或驗證模型", unavailable: "模型能力設定檔暫時無法使用，請重新整理後再試", mode: "此模型不支援目前的任務模式；現有輸入已保留", references: "此模型最多支援 {count} 張參考圖片，請先移除超出的圖片", over: "超出限制", overDetail: "此參考圖片超出目前模型支援的數量限制", size: "所選模型不支援目前的輸出尺寸", format: "所選模型不支援目前的輸出格式", calls: "將發出 {count} 次獨立呼叫", optimization: "Prompt 最佳化", off: "關閉", standard: "標準最佳化", fast: "快速最佳化", random: "隨機", fixed: "固定", seedHint: "相同 Seed 可提高結果一致性，但不保證像素完全相同", seedInvalid: "請輸入此模型支援範圍內的整數 Seed", defaultSelected: "已選取供應商的預設模型", firstSelected: "先前的模型已無法使用；已選取第一個可用模型", fallbackSelected: "先前的模型已無法使用；已回到供應商預設模型", adjusted: "不支援的參數已調整為此模型的預設值", defaultLabel: "預設", saveFailed: "儲存模型偏好失敗", legacy: "通用基礎（舊版相容）", changedTitle: "模型能力已變更", changedMessage: "此任務儲存的模型能力版本與目前設定不同", changedDetail: "確認後會依目前能力重新驗證原始參數；不支援的參數不會被靜默捨棄", retry: "確認並重試",
  }),
  "zh-HK": dictionary({
    label: "生圖模型", none: "尚未設定生圖模型，請到系統設定新增或驗證模型", unavailable: "模型能力設定檔暫時無法使用，請重新整理後再試", mode: "此模型不支援目前的任務模式；現有輸入已保留", references: "此模型最多支援 {count} 張參考圖片，請先移除超出的圖片", over: "超出限制", overDetail: "此參考圖片超出目前模型支援的數量限制", size: "所選模型不支援目前的輸出尺寸", format: "所選模型不支援目前的輸出格式", calls: "將發出 {count} 次獨立呼叫", optimization: "Prompt 優化", off: "關閉", standard: "標準優化", fast: "快速優化", random: "隨機", fixed: "固定", seedHint: "相同 Seed 可提高結果一致性，但不保證像素完全相同", seedInvalid: "請輸入此模型支援範圍內的整數 Seed", defaultSelected: "已選取供應商的預設模型", firstSelected: "先前的模型已無法使用；已選取第一個可用模型", fallbackSelected: "先前的模型已無法使用；已返回供應商預設模型", adjusted: "不支援的參數已調整為此模型的預設值", defaultLabel: "預設", saveFailed: "儲存模型偏好失敗", legacy: "通用基礎（舊版兼容）", changedTitle: "模型能力已變更", changedMessage: "此任務儲存的模型能力版本與目前設定不同", changedDetail: "確認後會按目前能力重新驗證原始參數；不支援的參數不會被靜默捨棄", retry: "確認並重試",
  }),
  ja: dictionary({
    label: "画像生成モデル", none: "画像生成モデルが設定されていません。システム設定で追加または検証してください。", unavailable: "モデル機能プロファイルを利用できません。更新してもう一度お試しください。", mode: "このモデルは現在のタスクモードに対応していません。入力内容は保持されています。", references: "このモデルで使用できる参照画像は最大 {count} 枚です。超過分を削除してください。", over: "上限超過", overDetail: "この参照画像は現在のモデルの枚数上限を超えています", size: "選択したモデルはこの出力サイズに対応していません。", format: "選択したモデルはこの出力形式に対応していません。", calls: "{count} 回の独立した呼び出しを実行します", optimization: "プロンプト最適化", off: "オフ", standard: "標準", fast: "高速", random: "ランダム", fixed: "固定", seedHint: "同じ Seed で一貫性を高められますが、ピクセル単位で同一になる保証はありません。", seedInvalid: "このモデルの対応範囲内の整数 Seed を入力してください。", defaultSelected: "プロバイダーの既定モデルを選択しました。", firstSelected: "以前のモデルは利用できないため、最初の利用可能なモデルを選択しました。", fallbackSelected: "以前のモデルは利用できないため、プロバイダーの既定モデルに戻しました。", adjusted: "未対応のパラメーターをこのモデルの既定値に調整しました。", defaultLabel: "既定", saveFailed: "モデル設定を保存できませんでした", legacy: "汎用基本（従来互換）", changedTitle: "モデル機能が変更されました", changedMessage: "このタスクは現在と異なるモデル機能バージョンで保存されています。", changedDetail: "確認すると、元のパラメーターを現在のプロファイルで再検証します。未対応の値は自動的に破棄されません。", retry: "確認して再試行",
  }),
  ko: dictionary({
    label: "이미지 생성 모델", none: "이미지 생성 모델이 구성되지 않았습니다. 시스템 설정에서 추가하거나 검증하세요.", unavailable: "모델 기능 프로필을 사용할 수 없습니다. 새로 고친 후 다시 시도하세요.", mode: "이 모델은 현재 작업 모드를 지원하지 않습니다. 입력은 그대로 유지되었습니다.", references: "이 모델은 참조 이미지를 최대 {count}개까지 지원합니다. 초과 이미지를 제거하세요.", over: "한도 초과", overDetail: "이 참조 이미지는 현재 모델의 수량 한도를 초과합니다", size: "선택한 모델은 이 출력 크기를 지원하지 않습니다.", format: "선택한 모델은 이 출력 형식을 지원하지 않습니다.", calls: "독립 호출 {count}회를 실행합니다", optimization: "프롬프트 최적화", off: "끄기", standard: "표준", fast: "빠르게", random: "무작위", fixed: "고정", seedHint: "같은 Seed는 결과 일관성을 높일 수 있지만 픽셀 단위 동일성을 보장하지 않습니다.", seedInvalid: "이 모델이 지원하는 범위의 정수 Seed를 입력하세요.", defaultSelected: "공급자의 기본 모델을 선택했습니다.", firstSelected: "이전 모델을 사용할 수 없어 첫 번째 사용 가능한 모델을 선택했습니다.", fallbackSelected: "이전 모델을 사용할 수 없어 공급자의 기본 모델로 돌아갔습니다.", adjusted: "지원되지 않는 매개변수를 이 모델의 기본값으로 조정했습니다.", defaultLabel: "기본", saveFailed: "모델 기본 설정을 저장하지 못했습니다", legacy: "일반 기본(레거시 호환)", changedTitle: "모델 기능이 변경됨", changedMessage: "이 작업은 현재와 다른 모델 기능 버전으로 저장되었습니다.", changedDetail: "확인하면 원래 매개변수를 현재 프로필로 다시 검증합니다. 지원되지 않는 값은 자동으로 삭제되지 않습니다.", retry: "확인 후 재시도",
  }),
  es: dictionary({
    label: "Modelo de generación", none: "No hay ningún modelo de generación configurado. Añade o valida uno en Ajustes del sistema.", unavailable: "El perfil de capacidades del modelo no está disponible. Actualiza e inténtalo de nuevo.", mode: "Este modelo no admite el modo de tarea actual. Se conservaron tus entradas.", references: "Este modelo admite como máximo {count} imágenes de referencia. Elimina las que sobren.", over: "Supera el límite", overDetail: "Esta imagen de referencia supera el límite del modelo actual", size: "El modelo seleccionado no admite este tamaño de salida.", format: "El modelo seleccionado no admite este formato de salida.", calls: "Se realizarán {count} llamadas independientes", optimization: "Optimización del prompt", off: "Desactivada", standard: "Estándar", fast: "Rápida", random: "Aleatoria", fixed: "Fija", seedHint: "Usar la misma Seed puede mejorar la coherencia, pero no garantiza resultados idénticos píxel a píxel.", seedInvalid: "Introduce una Seed entera dentro del intervalo admitido por este modelo.", defaultSelected: "Se seleccionó el modelo predeterminado del proveedor.", firstSelected: "El modelo anterior no está disponible; se seleccionó el primer modelo disponible.", fallbackSelected: "El modelo anterior no está disponible; se volvió al modelo predeterminado del proveedor.", adjusted: "Los parámetros no admitidos se ajustaron a los valores predeterminados de este modelo.", defaultLabel: "predeterminado", saveFailed: "No se pudieron guardar las preferencias del modelo", legacy: "Básico genérico (compatibilidad heredada)", changedTitle: "Las capacidades del modelo cambiaron", changedMessage: "Esta tarea se guardó con una versión distinta de capacidades del modelo.", changedDetail: "Al confirmar, los parámetros originales se volverán a validar con el perfil actual. Los valores no admitidos no se descartarán sin avisar.", retry: "Confirmar y reintentar",
  }),
  pt: dictionary({
    label: "Modelo de geração", none: "Nenhum modelo de geração está configurado. Adicione ou valide um nas Definições do sistema.", unavailable: "O perfil de capacidades do modelo não está disponível. Atualize e tente novamente.", mode: "Este modelo não suporta o modo de tarefa atual. As entradas foram mantidas.", references: "Este modelo suporta no máximo {count} imagens de referência. Remova as excedentes.", over: "Acima do limite", overDetail: "Esta imagem de referência excede o limite do modelo atual", size: "O modelo selecionado não suporta este tamanho de saída.", format: "O modelo selecionado não suporta este formato de saída.", calls: "Serão feitas {count} chamadas independentes", optimization: "Otimização do prompt", off: "Desativada", standard: "Padrão", fast: "Rápida", random: "Aleatória", fixed: "Fixa", seedHint: "Usar a mesma Seed pode melhorar a consistência, mas não garante resultados idênticos ao nível do pixel.", seedInvalid: "Introduza uma Seed inteira no intervalo suportado por este modelo.", defaultSelected: "O modelo padrão do fornecedor foi selecionado.", firstSelected: "O modelo anterior não está disponível; foi selecionado o primeiro modelo disponível.", fallbackSelected: "O modelo anterior não está disponível; voltou-se ao modelo padrão do fornecedor.", adjusted: "Os parâmetros não suportados foram ajustados para os valores padrão deste modelo.", defaultLabel: "padrão", saveFailed: "Não foi possível guardar as preferências do modelo", legacy: "Básico genérico (compatibilidade legada)", changedTitle: "As capacidades do modelo mudaram", changedMessage: "Esta tarefa foi guardada com uma versão diferente das capacidades do modelo.", changedDetail: "Ao confirmar, os parâmetros originais serão revalidados com o perfil atual. Valores não suportados não serão descartados silenciosamente.", retry: "Confirmar e tentar novamente",
  }),
  fr: dictionary({
    label: "Modèle de génération", none: "Aucun modèle de génération n’est configuré. Ajoutez-en ou validez-en un dans les paramètres système.", unavailable: "Le profil de capacités du modèle est indisponible. Actualisez puis réessayez.", mode: "Ce modèle ne prend pas en charge le mode de tâche actuel. Vos entrées ont été conservées.", references: "Ce modèle accepte au maximum {count} images de référence. Supprimez les images en trop.", over: "Limite dépassée", overDetail: "Cette image de référence dépasse la limite du modèle actuel", size: "Le modèle sélectionné ne prend pas en charge cette taille de sortie.", format: "Le modèle sélectionné ne prend pas en charge ce format de sortie.", calls: "{count} appels indépendants seront effectués", optimization: "Optimisation du prompt", off: "Désactivée", standard: "Standard", fast: "Rapide", random: "Aléatoire", fixed: "Fixe", seedHint: "La même Seed peut améliorer la cohérence, sans garantir un résultat identique au pixel près.", seedInvalid: "Saisissez une Seed entière dans la plage prise en charge par ce modèle.", defaultSelected: "Le modèle par défaut du fournisseur a été sélectionné.", firstSelected: "Le modèle précédent est indisponible ; le premier modèle disponible a été sélectionné.", fallbackSelected: "Le modèle précédent est indisponible ; le modèle par défaut du fournisseur a été sélectionné.", adjusted: "Les paramètres non pris en charge ont été ajustés aux valeurs par défaut de ce modèle.", defaultLabel: "par défaut", saveFailed: "Échec de l’enregistrement des préférences du modèle", legacy: "Générique de base (compatibilité héritée)", changedTitle: "Les capacités du modèle ont changé", changedMessage: "Cette tâche a été enregistrée avec une autre version des capacités du modèle.", changedDetail: "Après confirmation, les paramètres d’origine seront revalidés avec le profil actuel. Les valeurs non prises en charge ne seront pas supprimées silencieusement.", retry: "Confirmer et réessayer",
  }),
  de: dictionary({
    label: "Generierungsmodell", none: "Es ist kein Generierungsmodell eingerichtet. Fügen Sie eines in den Systemeinstellungen hinzu oder validieren Sie es.", unavailable: "Das Modellfähigkeitsprofil ist nicht verfügbar. Aktualisieren Sie die Seite und versuchen Sie es erneut.", mode: "Dieses Modell unterstützt den aktuellen Aufgabenmodus nicht. Ihre Eingaben wurden beibehalten.", references: "Dieses Modell unterstützt höchstens {count} Referenzbilder. Entfernen Sie überzählige Bilder.", over: "Limit überschritten", overDetail: "Dieses Referenzbild überschreitet das Limit des aktuellen Modells", size: "Das ausgewählte Modell unterstützt diese Ausgabegröße nicht.", format: "Das ausgewählte Modell unterstützt dieses Ausgabeformat nicht.", calls: "Es werden {count} unabhängige Aufrufe ausgeführt", optimization: "Prompt-Optimierung", off: "Aus", standard: "Standard", fast: "Schnell", random: "Zufällig", fixed: "Fest", seedHint: "Dieselbe Seed kann die Konsistenz verbessern, garantiert aber keine pixelgleichen Ergebnisse.", seedInvalid: "Geben Sie eine ganzzahlige Seed im unterstützten Bereich dieses Modells ein.", defaultSelected: "Das Standardmodell des Anbieters wurde ausgewählt.", firstSelected: "Das vorherige Modell ist nicht verfügbar; das erste verfügbare Modell wurde ausgewählt.", fallbackSelected: "Das vorherige Modell ist nicht verfügbar; das Standardmodell des Anbieters wurde ausgewählt.", adjusted: "Nicht unterstützte Parameter wurden auf die Standardwerte dieses Modells gesetzt.", defaultLabel: "Standard", saveFailed: "Die Modelleinstellungen konnten nicht gespeichert werden", legacy: "Generisch, Basis (Legacy-Kompatibilität)", changedTitle: "Modellfähigkeiten wurden geändert", changedMessage: "Diese Aufgabe wurde mit einer anderen Version der Modellfähigkeiten gespeichert.", changedDetail: "Nach der Bestätigung werden die ursprünglichen Parameter mit dem aktuellen Profil erneut validiert. Nicht unterstützte Werte werden nicht stillschweigend verworfen.", retry: "Bestätigen und erneut versuchen",
  }),
  ru: dictionary({
    label: "Модель генерации", none: "Модель генерации не настроена. Добавьте или проверьте её в системных настройках.", unavailable: "Профиль возможностей модели недоступен. Обновите страницу и повторите попытку.", mode: "Эта модель не поддерживает текущий режим задачи. Введённые данные сохранены.", references: "Эта модель поддерживает не более {count} эталонных изображений. Удалите лишние.", over: "Превышен лимит", overDetail: "Это эталонное изображение превышает лимит текущей модели", size: "Выбранная модель не поддерживает этот размер результата.", format: "Выбранная модель не поддерживает этот формат результата.", calls: "Будет выполнено независимых вызовов: {count}", optimization: "Оптимизация запроса", off: "Выкл.", standard: "Стандартная", fast: "Быстрая", random: "Случайное", fixed: "Фиксированное", seedHint: "Одинаковая Seed может повысить согласованность, но не гарантирует попиксельное совпадение.", seedInvalid: "Введите целочисленную Seed в диапазоне, поддерживаемом этой моделью.", defaultSelected: "Выбрана модель поставщика по умолчанию.", firstSelected: "Предыдущая модель недоступна; выбрана первая доступная модель.", fallbackSelected: "Предыдущая модель недоступна; выбрана модель поставщика по умолчанию.", adjusted: "Неподдерживаемые параметры заменены значениями этой модели по умолчанию.", defaultLabel: "по умолчанию", saveFailed: "Не удалось сохранить настройки модели", legacy: "Универсальная базовая (совместимость)", changedTitle: "Возможности модели изменились", changedMessage: "Эта задача сохранена с другой версией возможностей модели.", changedDetail: "После подтверждения исходные параметры будут повторно проверены по текущему профилю. Неподдерживаемые значения не будут отброшены без уведомления.", retry: "Подтвердить и повторить",
  }),
  it: dictionary({
    label: "Modello di generazione", none: "Nessun modello di generazione è configurato. Aggiungine o convalidane uno nelle impostazioni di sistema.", unavailable: "Il profilo delle capacità del modello non è disponibile. Aggiorna e riprova.", mode: "Questo modello non supporta la modalità attività corrente. Gli input sono stati conservati.", references: "Questo modello supporta al massimo {count} immagini di riferimento. Rimuovi quelle in eccesso.", over: "Limite superato", overDetail: "Questa immagine di riferimento supera il limite del modello corrente", size: "Il modello selezionato non supporta questa dimensione di output.", format: "Il modello selezionato non supporta questo formato di output.", calls: "Verranno effettuate {count} chiamate indipendenti", optimization: "Ottimizzazione del prompt", off: "Disattivata", standard: "Standard", fast: "Rapida", random: "Casuale", fixed: "Fissa", seedHint: "La stessa Seed può migliorare la coerenza, ma non garantisce risultati identici a livello di pixel.", seedInvalid: "Inserisci una Seed intera nell’intervallo supportato da questo modello.", defaultSelected: "È stato selezionato il modello predefinito del fornitore.", firstSelected: "Il modello precedente non è disponibile; è stato selezionato il primo modello disponibile.", fallbackSelected: "Il modello precedente non è disponibile; è stato ripristinato il modello predefinito del fornitore.", adjusted: "I parametri non supportati sono stati impostati sui valori predefiniti di questo modello.", defaultLabel: "predefinito", saveFailed: "Impossibile salvare le preferenze del modello", legacy: "Generico di base (compatibilità precedente)", changedTitle: "Le capacità del modello sono cambiate", changedMessage: "Questa attività è stata salvata con una versione diversa delle capacità del modello.", changedDetail: "Dopo la conferma, i parametri originali verranno riconvalidati con il profilo corrente. I valori non supportati non verranno eliminati senza avviso.", retry: "Conferma e riprova",
  }),
  hi: dictionary({
    label: "इमेज जनरेशन मॉडल", none: "कोई जनरेशन मॉडल कॉन्फ़िगर नहीं है। सिस्टम सेटिंग में मॉडल जोड़ें या सत्यापित करें।", unavailable: "मॉडल क्षमता प्रोफ़ाइल उपलब्ध नहीं है। रीफ़्रेश करके फिर प्रयास करें।", mode: "यह मॉडल वर्तमान टास्क मोड का समर्थन नहीं करता। आपके इनपुट सुरक्षित रखे गए हैं।", references: "यह मॉडल अधिकतम {count} संदर्भ चित्रों का समर्थन करता है। अतिरिक्त चित्र हटाएँ।", over: "सीमा से अधिक", overDetail: "यह संदर्भ चित्र वर्तमान मॉडल की सीमा से अधिक है", size: "चुना गया मॉडल इस आउटपुट आकार का समर्थन नहीं करता।", format: "चुना गया मॉडल इस आउटपुट फ़ॉर्मैट का समर्थन नहीं करता।", calls: "{count} स्वतंत्र कॉल किए जाएँगे", optimization: "प्रॉम्प्ट ऑप्टिमाइज़ेशन", off: "बंद", standard: "मानक", fast: "तेज़", random: "रैंडम", fixed: "निश्चित", seedHint: "एक ही Seed परिणामों में संगति बढ़ा सकता है, लेकिन पिक्सेल-समान परिणाम की गारंटी नहीं देता।", seedInvalid: "इस मॉडल की समर्थित सीमा में पूर्णांक Seed दर्ज करें।", defaultSelected: "प्रदाता का डिफ़ॉल्ट मॉडल चुना गया।", firstSelected: "पिछला मॉडल उपलब्ध नहीं है; पहला उपलब्ध मॉडल चुना गया।", fallbackSelected: "पिछला मॉडल उपलब्ध नहीं है; प्रदाता का डिफ़ॉल्ट मॉडल चुना गया।", adjusted: "असमर्थित पैरामीटर इस मॉडल के डिफ़ॉल्ट मानों पर समायोजित किए गए।", defaultLabel: "डिफ़ॉल्ट", saveFailed: "मॉडल प्राथमिकताएँ सहेजी नहीं जा सकीं", legacy: "सामान्य बेसिक (पुरानी संगतता)", changedTitle: "मॉडल क्षमताएँ बदल गईं", changedMessage: "यह टास्क मॉडल क्षमताओं के अलग संस्करण के साथ सहेजा गया था।", changedDetail: "पुष्टि करने पर मूल पैरामीटर वर्तमान प्रोफ़ाइल के विरुद्ध फिर सत्यापित होंगे। असमर्थित मान बिना सूचना हटाए नहीं जाएँगे।", retry: "पुष्टि करें और पुनः प्रयास करें",
  }),
};

export const GENERATION_MODEL_SUMMARY_TRANSLATIONS: Partial<Record<Locale, TranslationDictionary>> = {
  "zh-TW": { "generationModel.summaryGeneric": "基礎生成 · 相容模式", "generationModel.summarySeedreamLite": "連續組圖 · 最高 4K", "generationModel.summarySeedreamPro": "精準編輯 · 最高 2K" },
  "zh-HK": { "generationModel.summaryGeneric": "基礎生成 · 兼容模式", "generationModel.summarySeedreamLite": "連續組圖 · 最高 4K", "generationModel.summarySeedreamPro": "精準編輯 · 最高 2K" },
  ja: { "generationModel.summaryGeneric": "基本生成 · 互換モード", "generationModel.summarySeedreamLite": "連続画像 · 最大 4K", "generationModel.summarySeedreamPro": "精密編集 · 最大 2K" },
  ko: { "generationModel.summaryGeneric": "기본 생성 · 호환 모드", "generationModel.summarySeedreamLite": "연속 이미지 · 최대 4K", "generationModel.summarySeedreamPro": "정밀 편집 · 최대 2K" },
  es: { "generationModel.summaryGeneric": "Generación básica · Modo compatible", "generationModel.summarySeedreamLite": "Serie de imágenes · Hasta 4K", "generationModel.summarySeedreamPro": "Edición precisa · Hasta 2K" },
  pt: { "generationModel.summaryGeneric": "Geração básica · Modo compatível", "generationModel.summarySeedreamLite": "Série de imagens · Até 4K", "generationModel.summarySeedreamPro": "Edição precisa · Até 2K" },
  fr: { "generationModel.summaryGeneric": "Génération de base · Mode compatible", "generationModel.summarySeedreamLite": "Série d’images · Jusqu’à 4K", "generationModel.summarySeedreamPro": "Édition précise · Jusqu’à 2K" },
  de: { "generationModel.summaryGeneric": "Basisgenerierung · Kompatibilitätsmodus", "generationModel.summarySeedreamLite": "Bildserie · Bis 4K", "generationModel.summarySeedreamPro": "Präzise Bearbeitung · Bis 2K" },
  ru: { "generationModel.summaryGeneric": "Базовая генерация · Режим совместимости", "generationModel.summarySeedreamLite": "Серия изображений · До 4K", "generationModel.summarySeedreamPro": "Точное редактирование · До 2K" },
  it: { "generationModel.summaryGeneric": "Generazione di base · Modalità compatibile", "generationModel.summarySeedreamLite": "Serie di immagini · Fino a 4K", "generationModel.summarySeedreamPro": "Modifica precisa · Fino a 2K" },
  hi: { "generationModel.summaryGeneric": "बेसिक जनरेशन · संगत मोड", "generationModel.summarySeedreamLite": "इमेज श्रृंखला · अधिकतम 4K", "generationModel.summarySeedreamPro": "सटीक संपादन · अधिकतम 2K" },
};
