"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Wallet, TrendingDown, TrendingUp, Filter } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, ApiError } from "@/lib/api";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@verger/shared";

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  SALAIRE: "Salaires",
  FOURNITURES: "Fournitures",
  MAINTENANCE: "Maintenance",
  LOYER: "Loyer",
  ELECTRICITE: "Électricité",
  EAU: "Eau",
  AUTRE: "Autre",
};

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  SALAIRE: "bg-blue-500",
  FOURNITURES: "bg-amber-500",
  MAINTENANCE: "bg-orange-500",
  LOYER: "bg-purple-500",
  ELECTRICITE: "bg-yellow-500",
  EAU: "bg-cyan-500",
  AUTRE: "bg-gray-500",
};

const CATEGORY_COLORS_LIGHT: Record<ExpenseCategory, string> = {
  SALAIRE: "bg-blue-500/20",
  FOURNITURES: "bg-amber-500/20",
  MAINTENANCE: "bg-orange-500/20",
  LOYER: "bg-purple-500/20",
  ELECTRICITE: "bg-yellow-500/20",
  EAU: "bg-cyan-500/20",
  AUTRE: "bg-gray-500/20",
};

const TABS = ["depenses", "repartition", "evolution"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  depenses: "Dépenses",
  repartition: "Répartition",
  evolution: "Évolution",
};

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type Expense = {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  date: string;
  createdAt: string;
};

type BudgetStats = {
  revenue: number;
  expenses: number;
  balance: number;
};

type ExpenseStats = {
  byCategory: {
    category: ExpenseCategory;
    count: number;
    total: number;
    percentage: number;
  }[];
  grandTotal: number;
  period: string;
};

type MonthlyData = {
  monthly: {
    month: string;
    label: string;
    revenue: number;
    expenses: number;
  }[];
};

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Page principale                                                      */
/* ------------------------------------------------------------------ */

export default function BudgetPage() {
  const [activeTab, setActiveTab] = useState<Tab>("depenses");

  // Budget overview
  const [budget, setBudget] = useState<BudgetStats | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(true);

  // Expenses list
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());

  // Stats
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsPeriod, setStatsPeriod] = useState("month");

  // Monthly evolution
  const [monthly, setMonthly] = useState<MonthlyData["monthly"]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(true);

  // Dialog
  const [dialog, setDialog] = useState<DialogState>(null);

  const loadBudget = useCallback(async () => {
    try {
      const res = await api.get<BudgetStats>("/budget");
      setBudget(res);
    } catch {
      // silently fail
    } finally {
      setBudgetLoading(false);
    }
  }, []);

  const loadExpenses = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterCategory) params.set("category", filterCategory);
      if (filterMonth) params.set("month", filterMonth);
      const res = await api.get<{ data: Expense[]; total: number }>(`/expenses?${params}`);
      setExpenses(res.data);
    } catch {
      // silently fail
    } finally {
      setExpensesLoading(false);
    }
  }, [filterCategory, filterMonth]);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get<ExpenseStats>(`/expenses/stats?period=${statsPeriod}`);
      setStats(res);
    } catch {
      // silently fail
    } finally {
      setStatsLoading(false);
    }
  }, [statsPeriod]);

  const loadMonthly = useCallback(async () => {
    try {
      const res = await api.get<MonthlyData>("/expenses/monthly");
      setMonthly(res.monthly);
    } catch {
      // silently fail
    } finally {
      setMonthlyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBudget();
    loadExpenses();
    loadStats();
    loadMonthly();
  }, [loadBudget, loadExpenses, loadStats, loadMonthly]);

  const maxCategoryTotal = Math.max(...(stats?.byCategory.map((c) => c.total) ?? []), 1);
  const maxMonthlyValue = Math.max(
    ...monthly.flatMap((m) => [m.revenue, m.expenses]),
    1
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Budget & Dépenses</h1>
          <p className="text-sm text-muted-foreground">
            Suivi financier de l&apos;école Le Verger
          </p>
        </div>
        <Button onClick={() => setDialog({ type: "add" })}>
          <Plus className="size-4" /> Ajouter une dépense
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenus</CardTitle>
            <TrendingUp className="size-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {budgetLoading ? "…" : formatFCFA(budget?.revenue ?? 0)}
            </div>
            <CardDescription>Paiements validés</CardDescription>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dépenses</CardTitle>
            <TrendingDown className="size-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {budgetLoading ? "…" : formatFCFA(budget?.expenses ?? 0)}
            </div>
            <CardDescription>Total des dépenses</CardDescription>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solde net</CardTitle>
            <Wallet className="size-5" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                !budgetLoading && (budget?.balance ?? 0) >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              {budgetLoading ? "…" : formatFCFA(budget?.balance ?? 0)}
            </div>
            <CardDescription>
              {(budget?.balance ?? 0) >= 0 ? "Excédent" : "Déficit"}
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab: Dépenses */}
      {activeTab === "depenses" && (
        <>
          {/* Filtres */}
          <Card className="rounded-2xl">
            <CardContent className="flex flex-wrap items-end gap-3 pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="size-4" />
                <span>Filtres</span>
              </div>
              <div className="w-[180px] space-y-2">
                <Label>Catégorie</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Toutes</SelectItem>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[180px] space-y-2">
                <Label>Mois</Label>
                <Input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          {expensesLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
            </div>
          ) : expenses.length === 0 ? (
            <Card className="rounded-2xl">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <TrendingDown className="size-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Aucune dépense enregistrée.
                </p>
                <Button onClick={() => setDialog({ type: "add" })}>
                  <Plus className="size-4" /> Ajouter une dépense
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(exp.date).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`${CATEGORY_COLORS_LIGHT[exp.category]} text-foreground`}
                        >
                          <span
                            className={`mr-1.5 inline-block size-2 rounded-full ${CATEGORY_COLORS[exp.category]}`}
                          />
                          {CATEGORY_LABELS[exp.category]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{exp.description}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatFCFA(Number(exp.amount))}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <Pencil className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setDialog({ type: "edit", expense: exp })}
                            >
                              <Pencil className="size-4" /> Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDialog({ type: "delete", expense: exp })}
                            >
                              <Trash2 className="size-4" /> Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Tab: Répartition */}
      {activeTab === "repartition" && (
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Répartition par catégorie</CardTitle>
              <CardDescription>
                {statsPeriod === "month" ? "Ce mois" : "Cette année"}
              </CardDescription>
            </div>
            <Select value={statsPeriod} onValueChange={setStatsPeriod}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Ce mois</SelectItem>
                <SelectItem value="year">Cette année</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-4">
            {statsLoading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : !stats?.byCategory.length ? (
              <p className="text-sm text-muted-foreground">Aucune donnée pour le moment.</p>
            ) : (
              <>
                {stats.byCategory.map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block size-3 rounded-full ${CATEGORY_COLORS[cat.category]}`}
                        />
                        <span className="font-medium">{CATEGORY_LABELS[cat.category]}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{cat.count} dépense{cat.count > 1 ? "s" : ""}</span>
                        <span className="font-semibold tabular-nums">
                          {formatFCFA(cat.total)}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          ({cat.percentage} %)
                        </span>
                      </div>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${CATEGORY_COLORS[cat.category]} transition-all duration-500`}
                        style={{
                          width: `${maxCategoryTotal > 0 ? (cat.total / maxCategoryTotal) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-sm font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatFCFA(stats.grandTotal)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Évolution */}
      {activeTab === "evolution" && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Évolution mensuelle</CardTitle>
            <CardDescription>Revenus vs dépenses sur 12 mois</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyLoading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donnée pour le moment.</p>
            ) : (
              <div className="space-y-4">
                {/* Legend */}
                <div className="flex gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="inline-block size-3 rounded-full bg-emerald-500" />
                    <span>Revenus</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block size-3 rounded-full bg-red-500" />
                    <span>Dépenses</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block size-3 rounded-full bg-muted-foreground" />
                    <span>Solde</span>
                  </div>
                </div>

                {/* Chart */}
                <div className="flex items-end gap-2" style={{ height: "240px" }}>
                  {monthly.map((m) => {
                    const revenueHeight = maxMonthlyValue > 0 ? (m.revenue / maxMonthlyValue) * 100 : 0;
                    const expenseHeight = maxMonthlyValue > 0 ? (m.expenses / maxMonthlyValue) * 100 : 0;
                    const balance = m.revenue - m.expenses;
                    const balancePositive = balance >= 0;
                    return (
                      <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                        {/* Bar group */}
                        <div className="flex w-full items-end justify-center gap-1" style={{ height: "180px" }}>
                          <div className="flex flex-1 flex-col justify-end" style={{ height: `${revenueHeight}%`, minHeight: m.revenue > 0 ? "4px" : "0" }}>
                            <div className="w-full rounded-t-sm bg-emerald-500 transition-all duration-500" style={{ height: "100%" }} />
                          </div>
                          <div className="flex flex-1 flex-col justify-end" style={{ height: `${expenseHeight}%`, minHeight: m.expenses > 0 ? "4px" : "0" }}>
                            <div className="w-full rounded-t-sm bg-red-500 transition-all duration-500" style={{ height: "100%" }} />
                          </div>
                        </div>
                        {/* Balance indicator */}
                        <div className="text-[10px] tabular-nums text-muted-foreground">
                          {balance >= 0 ? "+" : ""}{formatFCFA(Math.abs(balance)).replace(" FCFA", "")}
                        </div>
                        {/* Month label */}
                        <span className="text-[10px] text-muted-foreground">{m.label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Detail table */}
                <div className="mt-4 overflow-hidden rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Mois</th>
                        <th className="px-4 py-2 text-right font-medium">Revenus</th>
                        <th className="px-4 py-2 text-right font-medium">Dépenses</th>
                        <th className="px-4 py-2 text-right font-medium">Solde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((m) => {
                        const balance = m.revenue - m.expenses;
                        return (
                          <tr key={m.month} className="border-t">
                            <td className="px-4 py-2 font-medium">{m.label}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-emerald-600">
                              {m.revenue > 0 ? formatFCFA(m.revenue) : "—"}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-red-600">
                              {m.expenses > 0 ? formatFCFA(m.expenses) : "—"}
                            </td>
                            <td
                              className={`px-4 py-2 text-right font-semibold tabular-nums ${
                                balance >= 0 ? "text-emerald-600" : "text-red-600"
                              }`}
                            >
                              {formatFCFA(balance)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      {dialog && (
        <ExpenseDialogShell
          dialog={dialog}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            await loadBudget();
            await loadExpenses();
            await loadStats();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog Shell                                                         */
/* ------------------------------------------------------------------ */

type DialogState =
  | { type: "add" }
  | { type: "edit"; expense: Expense }
  | { type: "delete"; expense: Expense }
  | null;

function ExpenseDialogShell({
  dialog,
  onClose,
  onSaved,
}: {
  dialog: Exclude<DialogState, null>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      toast.success(dialog.type === "delete" ? "Dépense supprimée" : "Enregistré");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  }

  if (dialog.type === "add") {
    return (
      <ExpenseFormDialog
        title="Nouvelle dépense"
        description="Enregistrez une dépense pour le suivi financier."
        busy={busy}
        submitLabel="Enregistrer"
        onSubmit={(values) => run(() => api.post("/expenses", values))}
        onClose={onClose}
      />
    );
  }

  if (dialog.type === "edit") {
    return (
      <ExpenseFormDialog
        title={`Modifier : ${dialog.expense.description}`}
        description="Modifiez les informations de la dépense."
        busy={busy}
        submitLabel="Enregistrer"
        defaults={{
          category: dialog.expense.category,
          description: dialog.expense.description,
          amount: dialog.expense.amount,
          date: new Date(dialog.expense.date).toISOString().split("T")[0],
        }}
        onSubmit={(values) => run(() => api.patch(`/expenses/${dialog.expense.id}`, values))}
        onClose={onClose}
      />
    );
  }

  return (
    <ConfirmDialog
      title={`Supprimer « ${dialog.expense.description} » ?`}
      description="Cette action est irréversible."
      busy={busy}
      onConfirm={() => run(() => api.delete(`/expenses/${dialog.expense.id}`))}
      onClose={onClose}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Expense Form Dialog                                                  */
/* ------------------------------------------------------------------ */

function ExpenseFormDialog({
  title,
  description,
  defaults,
  busy,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  description: string;
  defaults?: {
    category: ExpenseCategory;
    description: string;
    amount: string;
    date: string;
  };
  busy: boolean;
  submitLabel: string;
  onSubmit: (v: Record<string, string>) => Promise<unknown>;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<ExpenseCategory>(defaults?.category ?? "AUTRE");
  const [expDesc, setExpDesc] = useState(defaults?.description ?? "");
  const [amount, setAmount] = useState(defaults?.amount ?? "");
  const [date, setDate] = useState(defaults?.date ?? new Date().toISOString().split("T")[0]);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ category, description: expDesc, amount, date });
          }}
        >
          <div className="space-y-2">
            <Label>Catégorie</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="exp-desc">Description</Label>
            <Input
              id="exp-desc"
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              placeholder="Ex : Achat de craies, réparation clim…"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="exp-amount">Montant (FCFA)</Label>
              <Input
                id="exp-amount"
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-date">Date</Label>
              <Input
                id="exp-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Enregistrement…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm Dialog                                                       */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  title,
  description,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  busy: boolean;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? "Traitement…" : "Supprimer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
