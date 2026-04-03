import { config } from "@/lib/config";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-heading font-bold mb-6">Welcome to {config.product.name}</h1>
      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Total Projects</p>
            <p className="text-3xl font-bold mt-2">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Plan</p>
            <p className="text-3xl font-bold mt-2">Free</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Usage</p>
            <p className="text-3xl font-bold mt-2">0%</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
