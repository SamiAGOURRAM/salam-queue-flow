/**
 * TypeScript definitions for VitalHealth Design System
 * Generated from vitalhealth-design-system.json
 */

export interface DesignSystem {
  typography: Typography;
  colors: Colors;
  spacing: Spacing;
  borderRadius: BorderRadius;
  shadows: Shadows;
  components: Components;
  layout: Layout;
  animations: Animations;
  icons: Icons;
  zIndex: ZIndex;
  gradients: Gradients;
  patterns: Patterns;
}

export interface Typography {
  fontFamilies: {
    sans: {
      primary: string[];
      secondary: string[];
      mono: string[];
    };
  };
  fontSizes: {
    [key: string]: {
      size: string;
      lineHeight: string;
      letterSpacing: string;
    };
  };
  fontWeights: {
    light: number;
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
  };
}

export interface Colors {
  light: ColorScheme;
  dark: ColorScheme;
}

export interface ColorScheme {
  background: ColorScale;
  foreground: ColorScale;
  primary: ColorScale & { default: string; foreground: string };
  accent: ColorScale & { default: string; foreground: string };
  success: ColorScale & { default: string; foreground: string };
  warning: ColorScale & { default: string; foreground: string };
  error: ColorScale & { default: string; foreground: string };
  info: ColorScale & { default: string; foreground: string };
  purple: ColorScale & { default: string; foreground: string };
  orange: ColorScale & { default: string; foreground: string };
  border: {
    default: string;
    muted: string;
    strong: string;
  };
  sidebar: SidebarColors;
  header: HeaderColors;
  card: CardColors;
  table: TableColors;
  status: StatusColors;
}

export interface ColorScale {
  [key: string]: string;
}

export interface SidebarColors {
  background: string;
  foreground: string;
  active: string;
  activeForeground: string;
  hover: string;
  border: string;
  section: string;
}

export interface HeaderColors {
  background: string;
  foreground: string;
  border: string;
}

export interface CardColors {
  background: string;
  foreground: string;
  border: string;
  hover: string;
}

export interface TableColors {
  header: string;
  row: string;
  rowHover: string;
  border: string;
}

export interface StatusColors {
  active: string;
  inactive: string;
  pending: string;
  warning: string;
  error: string;
  online: string;
  offline: string;
}

export interface Spacing {
  scale: string;
  values: {
    [key: string]: string;
  };
}

export interface BorderRadius {
  [key: string]: string;
}

export interface Shadows {
  [key: string]: string;
}

export interface Components {
  sidebar: SidebarComponent;
  header: HeaderComponent;
  card: CardComponent;
  table: TableComponent;
  graph: GraphComponent;
  calendar: CalendarComponent;
  tabs: TabsComponent;
  badge: BadgeComponent;
  button: ButtonComponent;
  input: InputComponent;
  modal: ModalComponent;
  tooltip: TooltipComponent;
}

export interface SidebarComponent {
  width: {
    collapsed: string;
    expanded: string;
    mobile: string;
  };
  padding: {
    horizontal: string;
    vertical: string;
    item: string;
  };
  logo: {
    height: string;
    marginBottom: string;
  };
  navigation: {
    itemHeight: string;
    itemSpacing: string;
    iconSize: string;
    fontSize: string;
    fontWeight: number;
    activeIndicator: {
      width: string;
      height: string;
      borderRadius: string;
    };
  };
  section: {
    title: {
      fontSize: string;
      fontWeight: number;
      textTransform: string;
      letterSpacing: string;
      color: string;
      padding: string;
    };
  };
}

export interface HeaderComponent {
  height: string;
  padding: {
    horizontal: string;
    vertical: string;
  };
  search: {
    width: string;
    height: string;
    borderRadius: string;
    padding: string;
    fontSize: string;
  };
  actions: {
    spacing: string;
    iconSize: string;
    badge: {
      size: string;
      offset: string;
    };
  };
  profile: {
    avatarSize: string;
    statusDot: {
      size: string;
      border: string;
      offset: string;
    };
    nameFontSize: string;
    statusFontSize: string;
  };
}

export interface CardComponent {
  padding: {
    default: string;
    compact: string;
    spacious: string;
  };
  borderRadius: string;
  borderWidth: string;
  gap: {
    header: string;
    content: string;
  };
  statistics: {
    iconSize: string;
    iconBackground: string;
    valueFontSize: string;
    valueFontWeight: number;
    changeFontSize: string;
    descriptionFontSize: string;
    descriptionColor: string;
  };
}

export interface TableComponent {
  header: {
    height: string;
    padding: string;
    fontSize: string;
    fontWeight: number;
    textTransform: string;
    letterSpacing: string;
    color: string;
  };
  row: {
    height: string;
    padding: string;
    fontSize: string;
    hoverBackground: string;
  };
  cell: {
    padding: string;
    gap: string;
  };
  avatar: {
    size: string;
    borderRadius: string;
  };
  status: {
    dotSize: string;
    spacing: string;
  };
  actions: {
    iconSize: string;
    spacing: string;
    hoverColor: string;
  };
}

export interface GraphComponent {
  height: string;
  padding: string;
  axis: {
    color: string;
    fontSize: string;
    strokeWidth: string;
  };
  grid: {
    color: string;
    strokeWidth: string;
    strokeDasharray: string;
  };
  line: {
    strokeWidth: string;
    onTime: {
      color: string;
      dotRadius: string;
    };
    onLate: {
      color: string;
      dotRadius: string;
    };
  };
  tooltip: {
    background: string;
    border: string;
    borderColor: string;
    borderRadius: string;
    padding: string;
    shadow: string;
    fontSize: string;
  };
  legend: {
    fontSize: string;
    spacing: string;
    dotSize: string;
  };
}

export interface CalendarComponent {
  width: string;
  padding: string;
  header: {
    height: string;
    fontSize: string;
    fontWeight: number;
    buttonSize: string;
  };
  weekdays: {
    height: string;
    fontSize: string;
    fontWeight: number;
    color: string;
  };
  day: {
    size: string;
    borderRadius: string;
    fontSize: string;
    selected: {
      background: string;
      color: string;
    };
    today: {
      fontWeight: number;
      color: string;
    };
    event: {
      dotSize: string;
      spacing: string;
      colors: {
        appointment: string;
        meeting: string;
        surgery: string;
      };
    };
  };
}

export interface TabsComponent {
  height: string;
  padding: string;
  borderRadius: string;
  background: string;
  item: {
    padding: string;
    fontSize: string;
    fontWeight: number;
    active: {
      background: string;
      color: string;
      borderRadius: string;
    };
  };
}

export interface BadgeComponent {
  height: string;
  padding: string;
  borderRadius: string;
  fontSize: string;
  fontWeight: number;
  notification: {
    size: string;
    borderRadius: string;
    background: string;
    color: string;
    fontSize: string;
    minWidth: string;
  };
}

export interface ButtonComponent {
  sizes: {
    sm: {
      height: string;
      padding: string;
      fontSize: string;
    };
    md: {
      height: string;
      padding: string;
      fontSize: string;
    };
    lg: {
      height: string;
      padding: string;
      fontSize: string;
    };
  };
  variants: {
    primary: {
      background: string;
      color: string;
      hover: string;
    };
    secondary: {
      background: string;
      color: string;
      hover: string;
    };
    ghost: {
      background: string;
      color: string;
      hover: string;
    };
    outline: {
      background: string;
      color: string;
      border: string;
      borderColor: string;
      hover: string;
    };
  };
  borderRadius: string;
  fontWeight: number;
  transition: string;
}

export interface InputComponent {
  height: string;
  padding: string;
  borderRadius: string;
  borderWidth: string;
  borderColor: string;
  fontSize: string;
  focus: {
    borderColor: string;
    ring: string;
    ringColor: string;
    ringOffset: string;
  };
}

export interface ModalComponent {
  overlay: {
    background: string;
    backdrop: string;
  };
  content: {
    background: string;
    borderRadius: string;
    padding: string;
    maxWidth: string;
    shadow: string;
  };
  header: {
    padding: string;
    fontSize: string;
    fontWeight: number;
  };
}

export interface TooltipComponent {
  background: string;
  color: string;
  padding: string;
  borderRadius: string;
  fontSize: string;
  shadow: string;
  arrowSize: string;
}

export interface Layout {
  container: {
    maxWidth: string;
    padding: {
      mobile: string;
      tablet: string;
      desktop: string;
    };
  };
  grid: {
    columns: number;
    gap: {
      sm: string;
      md: string;
      lg: string;
    };
  };
  breakpoints: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    "2xl": string;
  };
}

export interface Animations {
  duration: {
    fast: string;
    base: string;
    slow: string;
    slower: string;
  };
  easing: {
    easeIn: string;
    easeOut: string;
    easeInOut: string;
    spring: string;
  };
  transitions: {
    default: string;
    colors: string;
    transform: string;
  };
}

export interface Icons {
  sizes: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    "2xl": string;
  };
  strokeWidth: {
    thin: number;
    normal: number;
    bold: number;
  };
}

export interface ZIndex {
  base: number;
  dropdown: number;
  sticky: number;
  fixed: number;
  modalBackdrop: number;
  modal: number;
  popover: number;
  tooltip: number;
  toast: number;
  [key: string]: number;
}

export interface Gradients {
  primary: {
    light: string;
    dark: string;
  };
  success: {
    light: string;
    dark: string;
  };
  card: {
    light: string;
    dark: string;
  };
  overlay: {
    light: string;
    dark: string;
  };
}

export interface Patterns {
  statisticsCard: {
    layout: string;
    icon: {
      size: string;
      background: string;
      borderRadius: string;
      padding: string;
    };
    content: {
      gap: string;
    };
    value: {
      fontSize: string;
      fontWeight: number;
      lineHeight: string;
    };
    change: {
      fontSize: string;
      fontWeight: number;
      display: string;
      alignItems: string;
      gap: string;
    };
    description: {
      fontSize: string;
      color: string;
      lineHeight: string;
    };
  };
  dataTable: {
    header: {
      background: string;
      sticky: boolean;
      top: number;
      zIndex: number;
    };
    row: {
      borderBottom: string;
      borderColor: string;
      transition: string;
    };
    pagination: {
      padding: string;
      borderTop: string;
      borderColor: string;
    };
  };
  chartContainer: {
    padding: string;
    background: string;
    borderRadius: string;
    border: string;
    borderColor: string;
  };
}



