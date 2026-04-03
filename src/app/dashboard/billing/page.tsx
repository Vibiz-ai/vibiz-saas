import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BillingPage() {
  return (
    <div>
      <h1 className="text-2xl font-heading font-bold mb-6">Billing</h1>
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Current plan: Free</p>
              <p className="text-sm text-gray-500 mt-1">Upgrade to unlock more features.</p>
            </div>
            <Button href="/pricing">Upgrade</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
