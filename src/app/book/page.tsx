import BookingForm from '@/components/booking-form';

export default function BookingPage() {
    return (
        <main className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-center mb-8">Book Your IV Therapy Session</h1>
            <BookingForm />
        </main>
    );
} 