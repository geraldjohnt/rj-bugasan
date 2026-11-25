/* Lucide icons (ISC). Only icons imported here are bundled. */
import {
  LayoutDashboard, CalendarDays, ShoppingCart, ReceiptText, HandCoins, Users, Package, ArrowLeftRight,
  ClipboardList, Truck, Building2, Wallet, ChartColumn, History, DatabaseBackup, Settings, Menu, LogOut,
  KeyRound, Lock, Wifi, WifiOff, X, Check, CircleAlert, Info, TriangleAlert, ChevronDown, ChevronsLeft,
  ChevronsRight, Plus, Search, Eye, EyeOff, User, Monitor, Sun, Moon, Construction, Pencil, Archive, ArchiveRestore,
  PackageOpen, SlidersHorizontal, ArrowLeft, Trash2, Save, CircleCheck, Link, Database,
  Printer, Phone, Copy, Ban, CalendarClock, UserPlus, Receipt, Undo2, Contact, Star, Banknote, FileText, Minus,
  ChevronLeft, ChevronRight, Download, PackageCheck, CalendarPlus, List, CalendarRange, CircleStop, TrendingUp,
} from 'lucide';

const ICONS = {
  dashboard: LayoutDashboard, calendar: CalendarDays, newSale: ShoppingCart, sales: ReceiptText,
  collections: HandCoins, customers: Users, items: Package, movements: ArrowLeftRight, stockCount: ClipboardList,
  restocks: Truck, suppliers: Building2, expenses: Wallet, reports: ChartColumn, activity: History,
  backup: DatabaseBackup, settings: Settings, menu: Menu, logout: LogOut, key: KeyRound, lock: Lock,
  online: Wifi, offline: WifiOff, close: X, check: Check, error: CircleAlert, info: Info, warning: TriangleAlert,
  chevronDown: ChevronDown, collapse: ChevronsLeft, expand: ChevronsRight, plus: Plus, search: Search,
  eye: Eye, eyeOff: EyeOff, user: User, system: Monitor, sun: Sun, moon: Moon, planned: Construction,
  edit: Pencil, archive: Archive, restore: ArchiveRestore, openSack: PackageOpen, adjust: SlidersHorizontal,
  back: ArrowLeft, trash: Trash2, save: Save, done: CircleCheck, link: Link, sample: Database,
  print: Printer, phone: Phone, copy: Copy, cancel: Ban, reschedule: CalendarClock, addCustomer: UserPlus, receipt: Receipt,
  undo: Undo2, contact: Contact, star: Star, payment: Banknote, statement: FileText, minus: Minus,
  prev: ChevronLeft, next: ChevronRight, download: Download, receive: PackageCheck, addEvent: CalendarPlus, agenda: List,
  month: CalendarRange, close2: CircleStop, trend: TrendingUp,
};

export function Icon({ name, size = 18, className = '', title }) {
  const node = ICONS[name];
  if (!node) return null;
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {node.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
